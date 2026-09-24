/**
 * useCompanyTerminal — TanStack Query hooks for Terminal Emiten / Screener.
 * ==========================================================================
 * Features To Be Implemented.md items this powers:
 *   Algoritma 2 (Piotroski F-Score), Algoritma 3 (Altman Z"-Score),
 *   Algoritma 4 (Dominance Score), Gap 2 (Valuation Percentile Rank 5Y),
 *   A (Free Float & Liquidity Risk), B (Analyst Expectation Gap),
 *   C (ESG Momentum Tier), E (Revenue Concentration HHI).
 *
 * CREDIT POLICY (verified live 2026-09-24 through our proxy):
 *   /v2/company/report/{sym}/ costs 1 credit PER SECTION (financials = 2).
 *   Requesting overview,valuation,financials,dividend,future = 6 credits per
 *   symbol, cached 24h server-side — subsequent reads are free.
 *   Every request passes through endpoint-registry validation first, so an
 *   invalid symbol is a free local 400 instead of a billed 404.
 *
 *   /v2/free-float/ returns the WHOLE IDX (961 rows) for one credit, so the
 *   client calls it ONCE and looks every symbol up locally rather than
 *   issuing a per-symbol request.
 *
 *   /v2/company/get-segments/{sym}/ = 1 credit, only fetched when the user
 *   opens the concentration panel (enabled: false by default → lazy).
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE_FUNDAMENTAL, STALE_STATIC } from "@/lib/query-config";
import type { CompanyFinancialsInput } from "@/lib/algorithms/distress";

// ── Server passthrough shapes (company-report adapter is `raw` today) ─────
export interface CompanyReportRaw {
  symbol?: string;
  company_name?: string;
  overview?: {
    sub_sector?: string | null;
    sector?: string | null;
    industry?: string | null;
    market_cap?: number | null;
    esg_score?: number | null;
    last_close_price?: number | null;
    indices?: string[] | null;
    tags?: string[] | null;
  } | null;
  valuation?: {
    forward_pe?: number | null;
    last_close_price?: number | null;
    historical_valuation?: Array<Record<string, unknown>> | Record<string, Record<string, unknown>> | null;
  } | null;
  financials?: {
    eps?: number | null;
    historical_eps?: Record<string, Record<string, number>> | null;
    historical_financials?: Array<Record<string, unknown>> | null;
    historical_financial_ratio?: Array<Record<string, unknown>> | null;
    yoy_quarter_revenue_growth?: number | null;
    yoy_quarter_earnings_growth?: number | null;
  } | null;
  future?: {
    company_growth_forecasts?: Array<Record<string, unknown>> | null;
  } | null;
  dividend?: {
    yield_ttm?: number | null;
    payout_ratio?: number | null;
  } | null;
  peers?: unknown;
}

/** Sections actually needed — keeps a symbol to 6 credits instead of 8. */
const SECTIONS = "overview,valuation,financials,dividend,future";

export function useCompanyReport(symbol: string | null) {
  return useQuery({
    queryKey: ["sectors", "company-report", symbol, SECTIONS],
    queryFn: () =>
      api.sectors.get<CompanyReportRaw>(`/company/report/${symbol}/`, { sections: SECTIONS }),
    enabled: !!symbol,
    ...STALE_FUNDAMENTAL,
    retry: false,
  });
}

export function useCompanyReports(symbols: string[]) {
  return useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["sectors", "company-report", symbol, SECTIONS],
      queryFn: () =>
        api.sectors.get<CompanyReportRaw>(`/company/report/${symbol}/`, { sections: SECTIONS }),
      enabled: !!symbol,
      ...STALE_FUNDAMENTAL,
      retry: false,
    })),
  });
}

/** Adapts the raw report into the shape the distress algorithms consume. */
export function toCompanyFinancialsInput(r: CompanyReportRaw): CompanyFinancialsInput {
  return {
    symbol: r.symbol,
    company_name: r.company_name,
    overview: r.overview,
    financials: r.financials,
    valuation: r.valuation,
    future: r.future,
    dividend: r.dividend,
  };
}

// ── Free Float (Bagian 2 A) — one call covers the whole IDX ───────────────
export interface FreeFloatRow {
  symbol: string;      // keeps .JK
  company_name: string;
  free_float: number;  // 0..1
}

export function useFreeFloatMap() {
  return useQuery({
    queryKey: ["sectors", "free-float"],
    queryFn: () => api.sectors.get<FreeFloatRow[]>("/free-float/"),
    ...STALE_STATIC,
    retry: false,
    select: (rows) => {
      const arr = Array.isArray(rows) ? rows : [];
      const map = new Map<string, number>();
      for (const r of arr) {
        if (r?.symbol == null) continue;
        map.set(String(r.symbol).replace(/\.JK$/i, "").toUpperCase(), r.free_float);
      }
      return map;
    },
  });
}

// ── Peer-picking universe ────────────────────────────────────────────────
/**
 * Top IDX companies by market cap — used as the peer-picker universe on
 * Terminal Emiten. 1 credit, cached 6h server-side (TTL.companyList).
 * Only symbol + company_name come back unless metrics are named in `where`,
 * so we deliberately ask for nothing else — the per-symbol fundamentals come
 * from company/report once a peer is actually selected.
 */
export interface ScreenerCompany {
  symbol: string;
  company_name: string;
  query_values?: Record<string, unknown>;
}

export function useTopCompanies(limit = 20) {
  return useQuery({
    queryKey: ["sectors", "companies", "top-mcap", limit],
    queryFn: () =>
      api.sectors.get<{ results?: ScreenerCompany[] }>("/companies/", {
        order_by: "market_cap desc",
        limit,
      }),
    ...STALE_STATIC,
    retry: false,
    select: (data) =>
      (data?.results ?? []).map((r) => ({
        ticker: String(r.symbol ?? "").replace(/\.JK$/i, "").toUpperCase(),
        name: r.company_name ?? "",
      })).filter((c) => c.ticker !== ""),
  });
}

// ── Revenue segments (Bagian 2 E) — lazy, 1 credit per symbol ─────────────
export interface SegmentRow {
  source?: string;
  target?: string;
  value?: number;
}

export function useRevenueSegments(symbol: string | null, enabled = true) {
  return useQuery({
    queryKey: ["sectors", "get-segments", symbol],
    queryFn: () =>
      api.sectors.get<{ symbol?: string; financial_year?: number; revenue_breakdown?: SegmentRow[] }>(
        `/company/get-segments/${symbol}/`,
      ),
    enabled: !!symbol && enabled,
    ...STALE_FUNDAMENTAL,
    retry: false,
  });
}

/** Multiple symbols — only used when the comparison view explicitly asks. */
export function useRevenueSegmentsBatch(symbols: string[], enabled = false) {
  return useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["sectors", "get-segments", symbol],
      queryFn: () =>
        api.sectors.get<{ symbol?: string; financial_year?: number; revenue_breakdown?: SegmentRow[] }>(
          `/company/get-segments/${symbol}/`,
        ),
      enabled: enabled && !!symbol,
      ...STALE_FUNDAMENTAL,
      retry: false,
    })),
  });
}

// ── ESG (Bagian 2 C) — lazy, 1 credit / page of 30 ───────────────────────
/**
 * ESG-scored companies. /v2/companies/ max page size is 30, so the full ~960
 * universe is ~32 pages. Fetch just what the user requests and cache it.
 * By default fetches page 1 (1 credit) only; increasing `pages` loads more.
 */
export interface EsgRow {
  symbol: string;
  company_name: string;
  esg_score: number | null;
}

export function useEsgScores(pages = 1, enabled = true) {
  const queries = useQueries({
    queries: Array.from({ length: pages }, (_, i) => ({
      queryKey: ["sectors", "companies", "esg", i + 1],
      queryFn: () =>
        api.sectors.get<{ results?: Array<{ symbol: string; company_name: string; query_values?: Record<string, unknown> }> }>(
          "/companies/",
          {
            where: "esg_score > 0",
            order_by: "esg_score desc",
            limit: 30,
            page: i + 1,
            include_query_values: "true",
          },
        ),
      enabled,
      ...STALE_STATIC,
      retry: false,
    })),
  });
  return {
    data: queries
      .flatMap((q) => (q.data?.results ?? []) as EsgRow[])
      .map((r: { symbol: string; company_name: string; query_values?: Record<string, unknown> }) => ({
        ticker: String(r.symbol ?? "").replace(/\.JK$/i, "").toUpperCase(),
        name: r.company_name ?? "",
        score:
          typeof r.query_values?.["esg_score"] === "number"
            ? (r.query_values["esg_score"] as number)
            : null,
      })),
    isPending: queries.some((q) => q.isPending),
    isError: queries.some((q) => q.isError),
  };
}
