/**
 * Response adapters — one normalized shape per endpoint.
 * ==========================================================================
 * WHY THIS EXISTS
 *
 * The Sectors API returns shapes that don't match what the UI expects, and
 * it has renamed fields between versions. Three of the four dashboard hooks
 * were silently broken because they read fields that don't exist:
 *
 *   foreign-flow/{sym}/  → { symbol, start, end, data: [...] }
 *                          NOT a flat array  → hook did Array.isArray() → []
 *                          → foreign flow panel always empty
 *
 *   companies/top-changes/ → entries use: name, symbol ("BSSR.JK"),
 *                          last_close_price, price_change (decimal),
 *                          latest_close_date
 *                          hook expected: company_name, price,
 *                          price_change_pct, market_cap, sector
 *                          → every rendered field was undefined
 *
 *   subsector/report/{s}/ → growth.weighted_avg_growth_data (yearly map),
 *                          growth.growth_forecasts,
 *                          stability.weighted_max_drawdown,
 *                          stability.weighted_rsd_close
 *                          hook read: growth.revenue_growth_avg,
 *                          stability.relative_std_deviation_weighted
 *                          → computeSHI() always returned null
 *                          → SHI always fell back to mock
 *
 * Each adapter maps raw → normalized. The client ALWAYS sees the same shape
 * regardless of whether data came from Redis, file cache, logged fallback,
 * or live API.
 */

import type { AdapterName } from "../config/endpoint-registry";

// ── Normalized output types (shared with client via types mirror) ─────────

export interface NormIndexDailyPoint {
  date: string;
  close: number;      // canonical — API sometimes returns "price"
  volume?: number;
}

export interface NormIdxTotalPoint {
  date: string;
  market_cap: number; // canonical — API returns idx_total_market_cap
}

export interface NormForeignFlowPoint {
  date: string;
  symbol: string;
  net_foreign_inflow: number;
  foreign_share?: number;
}

export interface NormTopChangeEntry {
  symbol: string;          // stripped of .JK suffix
  company_name: string;
  price: number;           // from last_close_price
  price_change_pct: number;
  price_change: number | null;
  latest_close_date: string;
}

export interface NormTopChangesResponse {
  top_gainers: Record<string, NormTopChangeEntry[]>;
  top_losers: Record<string, NormTopChangeEntry[]>;
}

export interface NormSubsectorReport {
  sub_sector?: string;
  sector?: string;
  growth: {
    // Flattened latest-year values — what computeSHI() actually needs
    revenue_growth: number | null;
    earnings_growth: number | null;
    // Forecast (next year) if available
    forecast_revenue_growth: number | null;
    forecast_eps_growth: number | null;
    yearly: Array<{ year: string; revenue: number | null; earnings: number | null }>;
  };
  stability: {
    max_drawdown: number | null;        // from weighted_max_drawdown
    relative_std_deviation: number | null; // from weighted_rsd_close
  };
  // Structured (was: raw passthrough). Shapes confirmed from the API docs:
  valuation?: NormSubsectorValuation | null;
  market_cap?: NormSubsectorMarketCap | null;
  statistics?: unknown;
  companies?: unknown;
}

export interface NormSubsectorValuation {
  /** Latest year with a usable PE (positive). */
  pe: number | null;
  pb: number | null;
  ps: number | null;
  pcf: number | null;
  /** Full yearly series (for 5Y percentile / trend). */
  yearly: Array<{ year: string; pe: number | null; pb: number | null; ps: number | null; pcf: number | null }>;
}

export interface NormSubsectorMarketCap {
  total_market_cap: number | null;
  avg_market_cap: number | null;
  mcap_change_1w: number | null;
  mcap_change_ytd: number | null;
  performance_quantile: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function stripJk(symbol: unknown): string {
  return String(symbol ?? "").replace(/\.JK$/i, "").toUpperCase();
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Picks the latest non-null year entry from a {year: {...}} map */
function latestYearEntry(
  map: unknown,
  key: string,
  accept?: (v: number) => boolean,
): { year: string; value: number | null } | null {
  if (!map || typeof map !== "object") return null;
  const entries = Object.entries(map as Record<string, unknown>)
    .filter(([y]) => /^\d{4}$/.test(y))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const ok = accept ?? (() => true);
  // walk backwards to find most recent with a usable value
  for (let i = entries.length - 1; i >= 0; i--) {
    const [year, obj] = entries[i];
    if (obj && typeof obj === "object") {
      const v = num((obj as Record<string, unknown>)[key]);
      // Keep walking back if v is null OR fails the plausibility filter
      if (v !== null && ok(v)) return { year, value: v };
    }
  }
  return null;
}

function yearlySeries(map: unknown): Array<{ year: string; revenue: number | null; earnings: number | null }> {
  if (!map || typeof map !== "object") return [];
  return Object.entries(map as Record<string, unknown>)
    .filter(([y]) => /^\d{4}$/.test(y))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, obj]) => {
      const o = (obj ?? {}) as Record<string, unknown>;
      return {
        year,
        revenue: num(o["avg_annual_revenue_growth"]) ?? num(o["revenue_growth"]),
        earnings: num(o["avg_annual_earning_growth"]) ?? num(o["earnings_growth"]),
      };
    });
}

function forecastEntry(map: unknown): { revenue: number | null; eps: number | null } | null {
  if (!map || typeof map !== "object") return null;
  const entries = Object.entries(map as Record<string, unknown>)
    .filter(([y]) => /^\d{4}$/.test(y))
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return null;
  const [, obj] = entries[0]; // nearest forecast year
  const o = (obj ?? {}) as Record<string, unknown>;
  return { revenue: num(o["revenue_growth"]), eps: num(o["eps_growth"]) };
}

// ── Adapters ─────────────────────────────────────────────────────────────

function adaptIndexDaily(raw: unknown): NormIndexDailyPoint[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      const close = num(o["close"]) ?? num(o["price"]);
      if (close === null) return null;
      return {
        date: String(o["date"] ?? ""),
        close,
        volume: num(o["volume"]) ?? undefined,
      } as NormIndexDailyPoint;
    })
    .filter((x): x is NormIndexDailyPoint => x !== null);
}

function adaptIdxTotal(raw: unknown): NormIdxTotalPoint[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      const mc = num(o["idx_total_market_cap"]) ?? num(o["market_cap"]);
      if (mc === null) return null;
      return { date: String(o["date"] ?? ""), market_cap: mc } as NormIdxTotalPoint;
    })
    .filter((x): x is NormIdxTotalPoint => x !== null);
}

/**
 * foreign-flow/{symbol}/ returns { symbol, start, end, data: [...] }.
 * Unwrap to a flat array. If it's already an array, pass through.
 */
function adaptForeignFlowSymbol(raw: unknown): NormForeignFlowPoint[] {
  let arr: unknown[];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    arr = Array.isArray(o["data"]) ? (o["data"] as unknown[]) : [];
  } else {
    arr = [];
  }
  return arr
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        date: String(o["date"] ?? ""),
        symbol: stripJk(o["symbol"]),
        net_foreign_inflow: num(o["net_foreign_inflow"]) ?? 0,
        foreign_share: num(o["foreign_share"]) ?? undefined,
      } as NormForeignFlowPoint;
    })
    .filter((p) => p.date !== "");
}

/**
 * companies/top-changes/ → normalize entry field names and unwrap
 * the {top_gainers: {"1d": [...], "7d": [...]}} envelope.
 */
function adaptTopChanges(raw: unknown): NormTopChangesResponse {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  function group(key: string): Record<string, NormTopChangeEntry[]> {
    const g = o[key];
    if (!g || typeof g !== "object") return {};
    const out: Record<string, NormTopChangeEntry[]> = {};
    for (const [period, list] of Object.entries(g as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      out[period] = list.map((e) => {
        const it = (e ?? {}) as Record<string, unknown>;
        const price = num(it["last_close_price"]) ?? num(it["price"]) ?? 0;
        const pct = num(it["price_change"]) ?? num(it["price_change_pct"]) ?? 0;
        return {
          symbol: stripJk(it["symbol"]),
          company_name: String(it["company_name"] ?? it["name"] ?? ""),
          price,
          price_change_pct: pct,
          price_change: num(it["price_change_abs"]),
          latest_close_date: String(it["latest_close_date"] ?? it["date"] ?? ""),
        } as NormTopChangeEntry;
      });
    }
    return out;
  }

  return { top_gainers: group("top_gainers"), top_losers: group("top_losers") };
}

/**
 * subsector/report/{slug}/ → flatten the yearly growth map into the
 * scalar fields computeSHI() expects.
 */
function adaptSubsectorReport(raw: unknown): NormSubsectorReport {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const growthObj = (o["growth"] ?? {}) as Record<string, unknown>;
  const stabilityObj = (o["stability"] ?? {}) as Record<string, unknown>;

  const wagd = growthObj["weighted_avg_growth_data"];
  const isPlausible = (v: number) => Number.isFinite(v) && Math.abs(v) <= 5;
  const latestRev = latestYearEntry(wagd, "avg_annual_revenue_growth", isPlausible)
    ?? latestYearEntry(wagd, "revenue_growth", isPlausible);
  const latestEarn = latestYearEntry(wagd, "avg_annual_earning_growth", isPlausible)
    ?? latestYearEntry(wagd, "earnings_growth", isPlausible);
  const fc = forecastEntry(growthObj["growth_forecasts"]);

  // Values already vetted by isPlausible during the walk-back; no further filter needed.
  const cleanRev = latestRev?.value ?? null;
  const cleanEarn = latestEarn?.value ?? null;

  const valuationCapData = normalizeValuation(o["valuation"]);
  const mcapCapData = normalizeMarketCap(o["market_cap"]);

  return {
    sub_sector: o["sub_sector"] as string | undefined,
    sector: o["sector"] as string | undefined,
    growth: {
      revenue_growth: cleanRev,
      earnings_growth: cleanEarn,
      forecast_revenue_growth: fc?.revenue ?? null,
      forecast_eps_growth: fc?.eps ?? null,
      yearly: yearlySeries(wagd),
    },
    stability: {
      max_drawdown:
        num(stabilityObj["weighted_max_drawdown"])
        ?? num(stabilityObj["max_drawdown"])
        ?? null,
      relative_std_deviation:
        num(stabilityObj["weighted_rsd_close"])
        ?? num(stabilityObj["relative_std_deviation_weighted"])
        ?? null,
    },
    // Structured instead of raw passthrough — the SHI formula in
    // src/lib/algorithms/shi.ts reads these exact paths. Documented shapes:
    //   valuation.historical_valuation[] = { pe, pb, ps, pcf, year }
    //   market_cap.mcap_summary.mcap_change = { "1w", "1y", "ytd" }
    valuation: valuationCapData,
    market_cap: mcapCapData,
    statistics: o["statistics"],
    companies: o["companies"],
  };
}

/**
 * valuation.historical_valuation — VERIFIED LIVE (2026-09-24): the API
 * returns it as a MAP keyed by year: {"2022": {pb, pe, ps, pcf}, ...}.
 * The docs' worked example shows an ARRAY of {pb, pe, ps, pcf, year} —
 * both shapes are handled here. Rank fields (*_rank) appear on some years
 * and are ignored.
 */
function normalizeValuation(raw: unknown): NormSubsectorReport["valuation"] {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hv = obj["historical_valuation"];

  type YearEntry = { year: string; pe: number | null; pb: number | null; ps: number | null; pcf: number | null };
  const yearly: YearEntry[] = [];

  const toEntry = (o: Record<string, unknown>, year: string): YearEntry => ({
    year,
    pe: num(o["pe"]),
    pb: num(o["pb"]),
    ps: num(o["ps"]),
    pcf: num(o["pcf"]),
  });

  if (Array.isArray(hv)) {
    // Docs' documented shape: [{pb, pe, ps, pcf, year}, ...]
    for (const e of hv) {
      const o = (e ?? {}) as Record<string, unknown>;
      const year = String(o["year"] ?? "");
      if (year !== "") yearly.push(toEntry(o, year));
    }
  } else if (hv && typeof hv === "object") {
    // LIVE shape (verified against /v2/subsector/report/banks/?sections=valuation):
    // {"2022": {pb, pe, ps, pcf}, "2023": {...}}
    for (const [year, val] of Object.entries(hv as Record<string, unknown>)) {
      if (!/^\d{4}$/.test(year)) continue;
      const o = (val && typeof val === "object" ? val : {}) as Record<string, unknown>;
      yearly.push(toEntry(o, year));
    }
  }

  yearly.sort((a, b) => a.year.localeCompare(b.year));

  // Newest year WITH a positive PE — a null/negative PE would zero the
  // valuation component silently.
  let pe: number | null = null;
  let pb: number | null = null;
  for (let i = yearly.length - 1; i >= 0; i--) {
    const entry = yearly[i];
    if (!entry) continue;
    if (entry.pe != null && entry.pe > 0) {
      pe = entry.pe;
      pb = entry.pb;
      break;
    }
  }

  return { pe, pb, ps: yearly.at(-1)?.ps ?? null, pcf: yearly.at(-1)?.pcf ?? null, yearly };
}

/**
 * market_cap.mcap_summary.mcap_change holds {"1w","1y","ytd"} — nested, not
 * the flat `mcap_change_1w` the client once assumed.
 */
function normalizeMarketCap(raw: unknown): NormSubsectorReport["market_cap"] {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const summary = (obj["mcap_summary"] ?? {}) as Record<string, unknown>;
  const change = (summary["mcap_change"] ?? {}) as Record<string, unknown>;

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = num(change[k]) ?? num(obj[k]);
      if (v !== null) return v;
    }
    return null;
  };

  return {
    total_market_cap: num(obj["total_market_cap"]),
    avg_market_cap: num(obj["avg_market_cap"]),
    mcap_change_1w: pick("1w", "mcap_change_1w"),
    mcap_change_ytd: pick("ytd", "mcap_change_ytd"),
    performance_quantile: num(summary["performance_quantile"]),
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────────

/**
 * Routes raw upstream data through the right adapter.
 * Unknown adapters pass through untouched.
 */
export function adapt(
  adapter: AdapterName,
  raw: unknown,
): unknown {
  switch (adapter) {
    case "index-daily":            return adaptIndexDaily(raw);
    case "idx-total":              return adaptIdxTotal(raw);
    case "foreign-flow-symbol":    return adaptForeignFlowSymbol(raw);
    case "companies-top-changes":  return adaptTopChanges(raw);
    case "subsector-report":       return adaptSubsectorReport(raw);
    default:                       return raw;
  }
}

// Note: the interfaces above are already exported inline via `export interface`,
// so no re-export block is needed here.
