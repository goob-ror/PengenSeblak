/**
 * useIpo — IPO Alpha Tracker
 * (Features To Be Implemented.md §F: IPO Alpha Tracker)
 *
 * Two endpoints, two credit profiles:
 *
 *   1. /v2/companies/?where=listing_date > 'YYYY-MM-DD'  — 1 credit/page
 *      Returns the recent-IPO cohort. Eagerly fetched on page load.
 *      IMPORTANT: the companies screener returns ONLY `symbol` + `company_name`
 *      at the top level. Every other field (sector, sub_sector, listing_date,
 *      market_cap, market_cap_rank) is materialised ONLY if it appears in the
 *      `where` clause, and is returned under `query_values` when
 *      `include_query_values=true`. So the where filter below references each
 *      field we need even when the filter condition is a tautology
 *      (e.g. `market_cap_rank >= 1`) — without it the field is silently absent
 *      and the UI renders "—" everywhere.
 *
 *   2. /v2/listing-performance/{symbol}/  — 1 credit PER symbol
 *      Returns price-change decimals since listing across 7/30/90/365-day
 *      windows: { symbol, chg_7d, chg_30d, chg_90d, chg_365d }.
 *      MUST be lazy (fetch on click → Sheet detail). Never batched.
 *      Only tickers listed after May 2005 have data; pre-2005 tickers 404.
 *
 * Credit strategy: the cohort list is the single eager call; performance is
 * 1 credit/symbol so we gate it behind `enabled` and never fan it out.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE_FUNDAMENTAL } from "@/lib/query-config";

// ── Cohort list (/v2/companies/) ──────────────────────────────────────────

/**
 * IPO cohort row. The screener returns these fields under `query_values`; we
 * lift them to a flat interface for ergonomic use in the component.
 */
export interface IpoCompany {
  symbol: string; // e.g. "BUKA.JK"
  company_name: string;
  sector: string | null;
  sub_sector: string | null;
  listing_date: string | null; // "YYYY-MM-DD"
  market_cap: number | null; // IDR
  market_cap_rank: number | null; // 1 = largest
}

interface CompaniesEnvelope {
  results: Array<{
    symbol: string;
    company_name: string;
    query_values?: Record<string, unknown>;
  }>;
  pagination?: { has_next?: boolean; next_offset?: number };
}

const SCREENER_LIMIT = 30;

/**
 * Look-back window for the IPO cohort. 18 months balances freshness (the
 * 365-day evaluation window needs ~1y of history to be meaningful) against
 * cohort size (IDX averages ~1-2 listings/month, so ~20-40 names).
 */
export function ipoCohortSinceDate(months = 18): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Builds the `where` filter. Every field we want back MUST be named here, or
 * the screener omits it from `query_values`. Conditions that are tautologies
 * (`market_cap_rank >= 1`) exist solely to make the field materialise.
 */
function buildCohortWhere(since: string): string {
  return [
    `listing_date > '${since}'`,
    `market_cap >= 0`,
    `market_cap_rank >= 1`,
    `sector != ''`,
    `sub_sector != ''`,
  ].join(" and ");
}

/** Normalises one raw screener row into the flat IpoCompany shape. */
function normalizeIpoRow(r: CompaniesEnvelope["results"][number]): IpoCompany {
  const q = r.query_values ?? {};
  return {
    symbol: r.symbol,
    company_name: r.company_name,
    listing_date: (q["listing_date"] as string) ?? null,
    market_cap: (q["market_cap"] as number) ?? null,
    market_cap_rank: (q["market_cap_rank"] as number) ?? null,
    sector: (q["sector"] as string) ?? null,
    sub_sector: (q["sub_sector"] as string) ?? null,
  };
}

/**
 * useIpoCohort — the eager cohort list (1 credit/page).
 *
 * Fetches up to 2 pages (60 names) sorted by listing_date descending. IDX IPO
 * volume is low enough that 1 page usually suffices, but we allow a second
 * to cover active periods. Pages are fetched sequentially to respect the
 * per-request billing model.
 */
export function useIpoCohort(since?: string) {
  const cutoff = since ?? ipoCohortSinceDate();
  const where = buildCohortWhere(cutoff);
  return useQuery({
    queryKey: ["sectors", "ipo-cohort", cutoff],
    queryFn: async () => {
      const collected: IpoCompany[] = [];
      let offset = 0;
      for (let page = 0; page < 2; page++) {
        const data = await api.sectors.get<CompaniesEnvelope>("/companies/", {
          where,
          order_by: "-listing_date",
          limit: SCREENER_LIMIT,
          offset,
          include_query_values: "true",
        });
        const rows = (data.results ?? []).map(normalizeIpoRow);
        if (rows.length === 0) break;
        collected.push(...rows);
        offset += SCREENER_LIMIT;
        if (!data.pagination?.has_next) break;
        if (rows.length < SCREENER_LIMIT) break;
      }
      return collected;
    },
    ...STALE_FUNDAMENTAL,
    // IPO cohorts refresh slowly (new listings are rare events); don't burn
    // credits retrying on transient failures.
    retry: false,
  });
}

// ── Listing performance (/v2/listing-performance/{symbol}/) ─────────────────

/**
 * Price-change decimals since listing across the 4 evaluation windows.
 * Values are decimals: 0.1235 ≈ +12.35%. Null = window hasn't elapsed yet
 * (e.g. a 2-week-old IPO has no 30/90/365d data).
 */
export interface ListingPerformance {
  symbol: string;
  chg_7d: number | null;
  chg_30d: number | null;
  chg_90d: number | null;
  chg_365d: number | null;
}

/**
 * useListingPerformance — lazy, 1 credit PER symbol.
 *
 * `enabled` defaults to false; the component flips it true when the user
 * clicks a row to open the detail Sheet. This is the core credit-safety
 * constraint: we NEVER fan this out across the cohort.
 *
 * Retry is disabled — a 404 (pre-May-2005 ticker) would otherwise waste a
 * credit on a second attempt that's guaranteed to fail the same way.
 */
export function useListingPerformance(symbol: string | null, enabled = false) {
  return useQuery({
    queryKey: ["sectors", "listing-performance", symbol],
    queryFn: () => api.sectors.get<ListingPerformance>(`/listing-performance/${symbol}/`),
    enabled: !!symbol && enabled,
    ...STALE_FUNDAMENTAL,
    retry: false,
  });
}
