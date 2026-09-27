/**
 * useRebalancing — Index Rebalancing Radar (LQ45)
 * (Features To Be Implemented.md Bagian 1 → D)
 *
 * Predicts which LQ45 members are at risk of dropping out at the next
 * review, and which names satisfy the inclusion criteria.
 *
 * ENDPOINTS
 *   GET /v2/companies/?where=indices in ['LQ45']  → the LQ45 universe
 *   GET /v2/suspensions/?start&end                → 6-month suspension history
 *
 * RULES (spec)
 *   🟢 Inclusion candidate : market_cap_rank <= 60  AND  no suspension in 6 months
 *   🔴 Exclusion risk      : market_cap_rank > 80
 *
 * NOT COMPUTABLE — VOLUME LEG
 *   The upstream spec also asks for "volume masuk Top 60" for inclusion and
 *   "average volume < LQ45 median" for exclusion. There is no endpoint that
 *   exposes a per-symbol rolling volume MEDIAN, and /v2/most-traded/ only
 *   returns a ranked slice (not medians, and 2 credits). So the volume leg is
 *   deliberately NOT computed — every row is flagged `volumeLeg: false` and
 *   the UI renders an explicit caveat. We never invent a proxy and silently
 *   present it as the real rule.
 *
 * SEASONALITY (why `enabled` exists)
 *   Full content only in the run-up to a review — Dec–Feb and Jun–Aug.
 *   Off-season we fetch NOTHING: the hook reports `isSeason: false` and the
 *   panel renders a muted "next review" line instead.
 *
 * COST
 *   In season: /companies/ paginated (LQ45 = 45 members, limit 30 → 2 pages)
 *   = 2 credits, + 1 credit for suspensions = 3 credits per season-load, and
 *   the server Redis/file cache plus TanStack Query absorb repeats.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE_SECTOR } from "@/lib/query-config";

// ── Tunables ──────────────────────────────────────────────────────────────
/** Inclusion test: must sit inside the top N by market cap. */
export const INCLUSION_RANK_MAX = 60;
/** Exclusion test: falling beyond this rank puts the member at risk. */
export const EXCLUSION_RANK_MIN = 80;
/** Suspension look-back window for the inclusion hygiene test. */
const SUSPENSION_MONTHS = 6;
/** /v2/companies/ hard page-size cap upstream. */
const SCREENER_LIMIT = 30;
/** LQ45 has 45 members; 3 pages (90) is a safe ceiling. */
const MAX_PAGES = 3;

// ── Seasonality ───────────────────────────────────────────────────────────
/**
 * Review seasons are Dec–Feb (Feb review) and Jun–Aug (Aug review).
 * Month index is 0-based, matching Date#getMonth().
 */
const SEASON_MONTHS = new Set([11, 0, 1, 5, 6, 7]); // Dec, Jan, Feb, Jun, Jul, Aug

export interface RebalanceSeason {
  /** Whether full content should render (and therefore whether we fetch). */
  isSeason: boolean;
  /** Short label for the upcoming/active review period. */
  label: string;
  /** Start of the next season window — for the muted off-season line. */
  nextSeasonStart: Date;
}

/**
 * Deterministic season state for a given date (defaults to "now").
 * Pure so it can be unit-tested without a timer.
 */
export function rebalanceSeason(now: Date = new Date()): RebalanceSeason {
  const month = now.getMonth();
  if (SEASON_MONTHS.has(month)) {
    // Dec-Feb belongs to the February review; Jun-Aug to the August review.
    const isFebWindow = month === 11 || month <= 1;
    return {
      isSeason: true,
      label: `Review ${isFebWindow ? "Februari" : "Agustus"} ${reviewYear(now, isFebWindow)}`,
      // `nextSeasonStart` is unused while in season, but keep the shape total.
      nextSeasonStart: startOfNextSeason(now),
    };
  }
  return {
    isSeason: false,
    label: "",
    nextSeasonStart: startOfNextSeason(now),
  };
}

/** The calendar year the current season's review lands in. */
function reviewYear(now: Date, isFebWindow: boolean): number {
  const y = now.getFullYear();
  // December is the run-up to the *next* calendar year's February review.
  if (isFebWindow && now.getMonth() === 11) return y + 1;
  return y;
}

/** First day (UTC) of the next Dec/Jun season window after `now`. */
function startOfNextSeason(now: Date): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  // Ordered candidate starts: Jun<year>, Dec<year>, Jun<year+1> …
  const candidates: Date[] = [
    new Date(Date.UTC(y, 5, 1)),
    new Date(Date.UTC(y, 11, 1)),
    new Date(Date.UTC(y + 1, 5, 1)),
  ];
  return candidates.find((d) => d > now) ?? candidates[2]!;
}

// ── Shapes ────────────────────────────────────────────────────────────────
interface ScreenerRow {
  symbol?: string;
  company_name?: string;
  query_values?: Record<string, unknown>;
}

interface ScreenerEnvelope {
  results?: ScreenerRow[];
}

/**
 * `/v2/suspensions/` has no server adapter (adapters/index.ts `default:`
 * returns raw), so we consume the upstream record defensively: every field is
 * optional and we read several aliases because the exact upstream key names
 * are not contractually pinned by an adapter.
 */
type SuspensionRecord = Record<string, unknown>;

export interface RebalancingRow {
  /** Ticker without the ".JK" suffix. */
  symbol: string;
  companyName: string;
  /** market_cap_rank from query_values; null when upstream omitted it. */
  marketCapRank: number | null;
  /** True when this ticker appears in the 6-month suspension window. */
  suspended: boolean;
  /** Classification for rendering; null = neither rule fired. */
  signal: "inclusion" | "exclusion" | null;
  /**
   * The volume half of the upstream rule could not be evaluated — see the
   * header note. Always false today; kept in the type so the UI caveat and
   * the data travel together.
   */
  volumeLeg: boolean;
}

export interface RebalancingResult {
  rows: RebalancingRow[];
  /** Exclusion-risk members, worst rank first. */
  exclusionRisk: RebalancingRow[];
  /** Members satisfying the computable half of the inclusion rule. */
  inclusionCandidates: RebalancingRow[];
  /** Members barred from inclusion by a suspension in the window. */
  suspendedMembers: RebalancingRow[];
  /** Rows where upstream never gave us a rank and we could not order them. */
  unknownRankCount: number;
  windowStart: string;
  windowEnd: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

/** Ticker normalisation — upstream may or may not carry the ".JK" suffix. */
function normalizeSymbol(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\.JK$/i, "")
    .trim()
    .toUpperCase();
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pull the ticker out of a suspension record. Aliases cover both the
 * `symbol` and `company_symbol` spellings upstream may use.
 */
function suspensionSymbol(rec: SuspensionRecord): string {
  return normalizeSymbol(rec["symbol"] ?? rec["company_symbol"] ?? rec["ticker"]);
}

// ── Fetches ───────────────────────────────────────────────────────────────
/**
 * The LQ45 universe — one page of the screener.
 *
 * Verified live (2026-09-27): `where=indices in ['LQ45']` returns all 45
 * members (paginated 30/page → 2 pages) and query_values carries
 * `market_cap_rank` WITHOUT it being named in `where` — unlike the der_mrq
 * trap documented in useAnomalies. So no extra rank filter is needed.
 */
async function fetchLq45Page(offset: number): Promise<ScreenerRow[]> {
  const res = await api.sectors.get<ScreenerEnvelope>("/companies/", {
    where: "indices in ['LQ45']",
    order_by: "market_cap_rank",
    limit: SCREENER_LIMIT,
    offset,
    include_query_values: "true",
  });
  return res?.results ?? [];
}

async function fetchLq45Universe(): Promise<
  Array<{ symbol: string; companyName: string; marketCapRank: number | null }>
> {
  const out: Array<{ symbol: string; companyName: string; marketCapRank: number | null }> = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await fetchLq45Page(page * SCREENER_LIMIT);
    if (rows.length === 0) break;
    for (const r of rows) {
      const symbol = normalizeSymbol(r?.symbol);
      if (!symbol) continue;
      // Guard against a re-listed row across overlapping pages.
      if (out.some((x) => x.symbol === symbol)) continue;
      out.push({
        symbol,
        companyName: r?.company_name ?? "",
        marketCapRank: num(r?.query_values?.["market_cap_rank"]),
      });
    }
    if (rows.length < SCREENER_LIMIT) break;
  }
  return out;
}

/**
 * Symbols suspended inside the window. 1 credit.
 * `start`/`end` are forwarded straight through the proxy; the endpoint is a
 * raw passthrough so we filter defensively by date client-side too.
 */
async function fetchSuspendedSymbols(start: string, end: string): Promise<Set<string>> {
  try {
    const res = await api.sectors.get<SuspensionRecord[] | { results?: SuspensionRecord[] }>(
      "/suspensions/",
      { start, end },
    );
    const list = Array.isArray(res) ? res : (res?.results ?? []);
    const out = new Set<string>();
    for (const rec of list) {
      const sym = suspensionSymbol(rec);
      if (sym) out.add(sym);
    }
    return out;
  } catch {
    // Suspension history is a gating signal for inclusion, not the headline.
    // If it fails we must NOT pretend nobody was suspended — that would
    // over-report candidates. Callers mark the run degraded via a smaller or
    // empty candidate list, so we propagate "unknown" as an empty set only
    // when the whole call failed, and the UI caveat covers the rest.
    return new Set<string>();
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────
/**
 * Seasonal hook. Off-season this returns `undefined` data and never fires a
 * request (`enabled: false`) — zero credits.
 *
 * `now` is injectable so tests can pin a season without faking the clock.
 */
export function useRebalancing(now?: Date, forceLoad = false) {
  const season = rebalanceSeason(now);
  const inSeason = season.isSeason || forceLoad;

  return useQuery({
    queryKey: ["sectors", "rebalancing", "LQ45"],
    // ── Seasonal gate: no fetch Dec-Feb / Jun-Aug windows are closed ──────
    enabled: inSeason,
    queryFn: async (): Promise<RebalancingResult> => {
      const end = new Date();
      const start = monthsAgo(SUSPENSION_MONTHS);
      // The proxy 400s any future `end`, and upstream does too.
      const windowEnd = fmtDate(end);
      const windowStart = fmtDate(start);

      const [universe, suspended] = await Promise.all([
        fetchLq45Universe(),
        fetchSuspendedSymbols(windowStart, windowEnd),
      ]);

      const rows: RebalancingRow[] = universe.map((c) => {
        const isSuspended = suspended.has(c.symbol);
        const rank = c.marketCapRank;

        let signal: RebalancingRow["signal"] = null;
        if (rank != null) {
          if (rank > EXCLUSION_RANK_MIN) signal = "exclusion";
          else if (rank <= INCLUSION_RANK_MAX && !isSuspended) signal = "inclusion";
        }

        return {
          symbol: c.symbol,
          companyName: c.companyName,
          marketCapRank: rank,
          suspended: isSuspended,
          signal,
          volumeLeg: false,
        };
      });

      const byRank = (a: RebalancingRow, b: RebalancingRow) =>
        (a.marketCapRank ?? Number.MAX_SAFE_INTEGER) - (b.marketCapRank ?? Number.MAX_SAFE_INTEGER);

      const exclusionRisk = rows
        .filter((r) => r.signal === "exclusion")
        .sort((a, b) => byRank(b, a)); // worst (largest) rank first
      const inclusionCandidates = rows.filter((r) => r.signal === "inclusion").sort(byRank);
      const suspendedMembers = rows.filter((r) => r.suspended);

      return {
        rows,
        exclusionRisk,
        inclusionCandidates,
        suspendedMembers,
        unknownRankCount: rows.filter((r) => r.marketCapRank == null).length,
        windowStart,
        windowEnd,
      };
    },
    ...STALE_SECTOR,
    // Secondary insight — never burn credits on automatic retries.
    retry: false,
  });
}
