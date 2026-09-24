/**
 * useAnomalies — Sector Divergence / Anomaly Detector
 * (Features To Be Implemented.md Algoritma 5)
 *
 * Uses the Companies Screener with structured `where` + `include_query_values=true`
 * to fetch per-company fundamentals per subsector, then runs Z-score detection.
 * Cost: 1 credit per subsector query (structured mode, never ?q=).
 *
 * The screener paginates at limit=30, so for each subsector we fetch up to
 * 3 pages = 3 credits per subsector × 6 non-bank subsectors = 18 credits/day.
 * Banks are excluded from the Value Trap rule only — DER is absent for banks,
 * confirmed live (0 rows with der_mrq >= 0 for sub_sector=Banks).
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE_SECTOR } from "@/lib/query-config";
import {
  detectAnomalies,
  normalizeScreenerRow,
  type ScreenerRow,
  type AnomalyResult,
} from "@/lib/algorithms/divergence";

/**
 * IMPORTANT — the screener matches `sub_sector` against DISPLAY names, not
 * slugs. Verified against cached live responses: rows come back carrying
 * "Basic Materials", "Oil, Gas & Coal", "Software & IT Services", ... The
 * slug form ("basic-materials") matches nothing, which is why the panel was
 * empty even though real anomalies existed in the data.
 *
 * Banks are added — the biggest sector was previously excluded entirely.
 * der_mrq is absent for banks, so the Value Trap rule cannot fire for them;
 * they can still produce Value Dislocation / Margin Deterioration signals.
 */
export const ANOMALY_SUBSECTORS = [
  "Basic Materials",
  "Oil, Gas & Coal",
  "Software & IT Services",
  "Retailing",
  "Telecommunication",
  "Transportation",
  "Banks",
] as const;

interface ScreenerApiEnvelope {
  results: Array<{ symbol: string; company_name: string; query_values?: Record<string, unknown> }>;
  pagination?: { has_next?: boolean; next_offset?: number };
}

const SCREENER_LIMIT = 30;
const MAX_PAGES = 3;

async function fetchScreenerPage(
  subsector: string,
  offset: number,
  marginYear: number,
): Promise<ScreenerRow[]> {
  // der_mrq MUST be named in `where` or the screener omits it from
  // query_values, silently disabling the Value Trap rule. But for banks
  // der_mrq is absent entirely, so `der_mrq >= 0` filters them out entirely
  // — only include it for non-bank subsectors.
  const isBank = subsector.toLowerCase().includes("bank");
  const where =
    `sub_sector='${subsector}' and pe_ttm > 0 and roe_ttm > -100 ` +
    `and net_profit_margin[${marginYear}] > -100` +
    (isBank ? "" : ` and der_mrq >= 0`);
  const rows = await api.sectors.get<ScreenerApiEnvelope>("/companies/", {
    where,
    limit: SCREENER_LIMIT,
    offset,
    include_query_values: "true",
  });
  return (rows.results ?? []).map((r) => normalizeScreenerRow(r, marginYear));
}

/** Fetches up to MAX_PAGES pages of a subsector's companies, sequentially. */
async function fetchSubsectorRows(subsector: string): Promise<ScreenerRow[]> {
  const marginYear = new Date().getFullYear() - 1; // last fully audited year
  const collected: ScreenerRow[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await fetchScreenerPage(subsector, offset, marginYear);
    if (rows.length === 0) break;
    collected.push(...rows);
    offset += SCREENER_LIMIT;
    // Stop early when the last page came back short — there is no more.
    if (rows.length < SCREENER_LIMIT) break;
  }
  return collected;
}

export function useAnomalies() {
  return useQuery({
    queryKey: ["sectors", "anomalies", ANOMALY_SUBSECTORS],
    queryFn: async () => {
      const allRows: ScreenerRow[] = [];
      for (const sub of ANOMALY_SUBSECTORS) {
        const rows = await fetchSubsectorRows(sub);
        allRows.push(...rows);
      }
      // Pages overlap when the screener re-lists a company across offsets,
      // so the same flag can surface more than once. Keep the strongest
      // instance per symbol rather than showing duplicates.
      const detected = detectAnomalies(allRows);
      const best = new Map<string, AnomalyResult>();
      for (const a of detected) {
        const prev = best.get(a.symbol);
        if (!prev || Math.abs(a.deviation) > Math.abs(prev.deviation)) {
          best.set(a.symbol, a);
        }
      }
      return Array.from(best.values()).sort((x, y) => {
        if (x.severity !== y.severity) return x.severity === "High" ? -1 : 1;
        return Math.abs(y.deviation) - Math.abs(x.deviation);
      });
    },
    ...STALE_SECTOR,
    // Don't retry on failure — anomalies are a secondary signal, and we
    // don't want to burn credits on auto-retry when the budget is tight.
    retry: false,
  });
}