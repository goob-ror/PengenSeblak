/**
 * divergence.ts — Sector Divergence Z-Score (Algoritma 5)
 * ==========================================================================
 * Z = (M_company - mean_M) / std_M    over the peer group
 * Flag when |Z| > 1.8
 *
 * Anomaly matrix from Features To Be Implemented.md:
 *   Z_PE < -1.8 AND Z_ROE > 0            → 💎 Value Dislocation
 *   Z_PE > +1.8 AND Z_ROE < 0            → ⚠️  Overvalued & Weak
 *   Z_Margin < -1.8                      → 📉 Margin Deterioration
 *   Z_PE < -1.8 AND Z_DER > +1.8         → 🪤 Value Trap Alert
 *
 * DATA NOTE (decided with the user): the screener route is used because it
 * exposes `der_mrq`, `free_float` and TTM snapshots the subsector "companies"
 * section does not. Cost: 1 credit per structured query (never ?q=, which
 * costs 3). Screener fields used here are all confirmed present in the docs:
 *   symbol, company_name, sub_sector, pe_ttm, roe_ttm, der_mrq,
 *   net_profit_margin[YYYY], pb_mrq, yield_ttm
 */

import { SHI_WEIGHTS } from "./shi";

/**
 * One screener row AFTER unwrapping `query_values`.
 *
 * CONFIRMED LIVE against /v2/companies/ (this cost real credits to establish,
 * so the findings are recorded here rather than rediscovered):
 *
 *  1. The screener returns ONLY {symbol, company_name} unless you pass
 *     `include_query_values=true`. With that flag each row gains a
 *     `query_values` object holding the fields named in the `where` clause.
 *     Without it you get no metrics at all — every Z-score would be null.
 *
 *  2. Key names inside query_values echo the where-clause EXACTLY, including
 *     bracket notation: `net_profit_margin[2024]` is literally keyed
 *     "net_profit_margin[2024]", not "net_margin".
 *
 *  3. `der_mrq` is populated for non-financials (basic-materials 91,
 *     retailing 26, oil-gas-coal 72...) but is entirely ABSENT for banks
 *     (0 rows). Debt-to-equity is not meaningful for banks, so the
 *     "Value Trap Alert" rule is structurally unavailable for that subsector.
 *     We surface this instead of faking it.
 *
 *  4. The screener must be called per sub_sector (sub_sector is NOT a
 *     supported top-level query param — it belongs in `where`), so each
 *     anomaly scan costs 1 credit per subsector, never the 3-credit `?q=` NLQ.
 */
export interface ScreenerRow {
  symbol: string;
  company_name: string;
  sub_sector?: string | null;
  sector?: string | null;
  pe_ttm?: number | null;
  pb_mrq?: number | null;
  roe_ttm?: number | null;
  roa_ttm?: number | null;
  der_mrq?: number | null;
  net_margin?: number | null;
  yield_ttm?: number | null;
  payout_ratio?: number | null;
  market_cap?: number | null;
  free_float?: number | null;
}

/**
 * Raw screener result row as returned by the API.
 * Metrics live under `query_values`; keys mirror the where-clause verbatim,
 * e.g. "pe_ttm", "net_profit_margin[2024]".
 */
export interface ScreenerApiRow {
  symbol: string;
  company_name: string;
  query_values?: Record<string, unknown>;
}

/** Pulls a numeric value from query_values, tolerating bracketed key names. */
function pickMetric(
  qv: Record<string, unknown> | undefined,
  ...candidates: string[]
): number | null {
  if (!qv) return null;
  for (const key of candidates) {
    if (key in qv) {
      const v = qv[key];
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  // Bracket-notation fallback: net_margin -> any "net_profit_margin[YYYY]"
  for (const [k, v] of Object.entries(qv)) {
    if (candidates.some((c) => k.startsWith(c))) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Strips the ".JK" suffix the screener includes on every symbol. */
export function cleanSymbol(symbol: string): string {
  return String(symbol ?? "").replace(/\.JK$/i, "").toUpperCase();
}

/**
 * Converts a raw API row into a ScreenerRow.
 * `marginYear` lets callers target a specific fiscal year; it falls back to
 * any available year when the requested one is missing.
 */
export function normalizeScreenerRow(
  row: ScreenerApiRow,
  marginYear?: number,
): ScreenerRow {
  const qv = row.query_values;
  const margin =
    pickMetric(qv, ...(marginYear != null ? [`net_profit_margin[${marginYear}]`] : [])) ??
    pickMetric(qv, "net_profit_margin");

  return {
    symbol: cleanSymbol(row.symbol),
    company_name: row.company_name ?? "",
    sub_sector: (qv?.["sub_sector"] as string) ?? null,
    pe_ttm: pickMetric(qv, "pe_ttm"),
    pb_mrq: pickMetric(qv, "pb_mrq"),
    roe_ttm: pickMetric(qv, "roe_ttm"),
    roa_ttm: pickMetric(qv, "roa_ttm"),
    der_mrq: pickMetric(qv, "der_mrq"),
    net_margin: margin,
    yield_ttm: pickMetric(qv, "yield_ttm"),
    payout_ratio: pickMetric(qv, "payout_ratio"),
    market_cap: pickMetric(qv, "market_cap"),
    free_float: pickMetric(qv, "free_float"),
  };
}

// ── Statistics helpers ────────────────────────────────────────────────────
export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1). Returns 0 when degenerate. */
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Z-score of `value` against the sample. Returns null when undefined —
 * either the peer group is too small, dispersion is zero, or the value is
 * missing. Callers must treat null as "no signal", never as 0.
 */
export function zScore(value: number | null | undefined, sample: number[]): number | null {
  const clean = sample.filter((v) => Number.isFinite(v));
  if (clean.length < 3 || value == null || !Number.isFinite(value)) return null;
  const s = std(clean);
  if (s === 0) return null; // every peer identical → no dispersion to measure
  return (value - mean(clean)) / s;
}

// ── Anomaly classification ────────────────────────────────────────────────
export type AnomalyType =
  | "value_dislocation"
  | "overvalued_weak"
  | "margin_deterioration"
  | "value_trap"
  | "none";

export interface AnomalyResult {
  symbol: string;
  company_name: string;
  sub_sector: string;
  type: AnomalyType;
  label: string;
  explanation: string;
  severity: "High" | "Medium";
  z: {
    pe: number | null;
    roe: number | null;
    margin: number | null;
    der: number | null;
  };
  metric: string;
  value: string;
  average: string;
  deviation: number;
}

const FLAG_THRESHOLD = 1.8;

/**
 * Evaluates one company against its peer group.
 * Pass peers WITHOUT the subject excluded — Z is computed vs the group mean,
 * and leaving the subject in only slightly shrinks its own deviation.
 */
export function detectAnomaly(row: ScreenerRow, peers: ScreenerRow[]): AnomalyResult | null {
  const zPe = zScore(row.pe_ttm, peers.map((p) => p.pe_ttm ?? NaN));
  const zRoe = zScore(row.roe_ttm, peers.map((p) => p.roe_ttm ?? NaN));
  const zMargin = zScore(row.net_margin, peers.map((p) => p.net_margin ?? NaN));
  const zDer = zScore(row.der_mrq, peers.map((p) => p.der_mrq ?? NaN));

  const z = { pe: zPe, roe: zRoe, margin: zMargin, der: zDer };

  let type: AnomalyType = "none";
  let label = "";
  let explanation = "";
  let severity: "High" | "Medium" = "Medium";
  let metric = "PE";
  let valueNum = row.pe_ttm ?? null;

  // Value Trap requires BOTH low Z_PE and high Z_DER. When DER data is
  // unavailable (the documented bank case) the rule does NOT fire — we fall
  // through to Margin Deterioration / Value Dislocation instead of silently
  // inventing a Z_DER from missing data.
  const derAvailable = row.der_mrq != null;

  // Value Trap takes precedence: it's the most actionable warning.
  if (derAvailable && zPe != null && zPe < -FLAG_THRESHOLD && zDer != null && zDer > FLAG_THRESHOLD) {
    type = "value_trap";
    label = "Value Trap Alert";
    explanation =
      "Valuasi tampak murah tetapi struktur utang jauh di atas rata-rata peer. Risiko leverage mengalahkan diskon valuasi.";
    severity = "High";
    metric = "DER";
    valueNum = row.der_mrq ?? null;
  } else if (zPe != null && zPe > FLAG_THRESHOLD && zRoe != null && zRoe < 0) {
    type = "overvalued_weak";
    label = "Overvalued & Weak";
    explanation =
      "Diperdagangkan jauh di atas rata-rata peer sementara profitabilitas (ROE) di bawah rata-rata.";
    severity = "High";
    metric = "PE";
    valueNum = row.pe_ttm ?? null;
  } else if (zMargin != null && zMargin < -FLAG_THRESHOLD) {
    type = "margin_deterioration";
    label = "Margin Deterioration";
    explanation =
      "Margin laba bersih tertinggal jauh dari peer — tekanan biaya atau daya pricing melemah.";
    metric = "Net Margin";
    valueNum = row.net_margin ?? null;
  } else if (zPe != null && zPe < -FLAG_THRESHOLD && zRoe != null && zRoe > 0) {
    type = "value_dislocation";
    label = "Value Dislocation";
    explanation =
      "Fundamental solid (ROE di atas rata-rata) namun valuasi di bawah peer — potensi mispricing.";
    metric = "PE";
    valueNum = row.pe_ttm ?? null;
  }

  if (type === "none") return null;

  const peersForMetric =
    metric === "PE" ? peers.map((p) => p.pe_ttm)
    : metric === "Net Margin" ? peers.map((p) => p.net_margin)
    : peers.map((p) => p.der_mrq);
  const avg = mean(peersForMetric.filter((v): v is number => v != null && Number.isFinite(v)));

  const pct = (v: number | null) =>
    v == null ? "—" : metric === "PE" || metric === "DER" ? v.toFixed(2) + "x" : (v * 100).toFixed(1) + "%";

  return {
    symbol: row.symbol,
    company_name: row.company_name,
    sub_sector: row.sub_sector ?? row.sector ?? "—",
    type,
    label,
    explanation,
    severity,
    z,
    metric,
    value: pct(valueNum),
    average: pct(Number.isFinite(avg) ? avg : null),
    deviation: Math.round(((valueNum ?? 0) - (Number.isFinite(avg) ? avg : 0)) * 100) / 100,
  };
}

/**
 * Runs detection across every company in a peer group.
 * Groups are per sub_sector — comparing a bank to a retailer produces
 * meaningless Z-scores, which is exactly the trap this avoids.
 */
export function detectAnomalies(rows: ScreenerRow[]): AnomalyResult[] {
  const bySector = new Map<string, ScreenerRow[]>();
  for (const r of rows) {
    const key = r.sub_sector ?? r.sector ?? "unknown";
    const list = bySector.get(key) ?? [];
    list.push(r);
    bySector.set(key, list);
  }

  const out: AnomalyResult[] = [];
  for (const [, peers] of bySector) {
    if (peers.length < 3) continue; // Z needs a real sample
    for (const row of peers) {
      const res = detectAnomaly(row, peers);
      if (res) out.push(res);
    }
  }

  // High severity first, then biggest absolute deviation
  return out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "High" ? -1 : 1;
    return Math.abs(b.deviation) - Math.abs(a.deviation);
  });
}

// Re-export so consumers can document the SHI weights alongside anomalies
export const ANOMALY_SHARED_WEIGHTS = SHI_WEIGHTS;
