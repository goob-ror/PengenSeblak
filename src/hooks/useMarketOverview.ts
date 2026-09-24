/**
 * useMarketOverview — TanStack Query hooks for Ringkasan Pasar (Dashboard).
 * ==========================================================================
 * Endpoints consumed (all through our Express proxy /api/sectors/*):
 *   GET /v2/index-daily/ihsg/           -> IHSG price series (30 days)
 *   GET /v2/idx-total/                  -> IDX total market cap (30 days)
 *   GET /v2/foreign-flow/IHSG/        -> Net foreign flow on IHSG (30 days)
 *   GET /v2/companies/top-changes/      -> Top gainers & losers (1d)
 *
 * FIELD-SHAPE FIX (2026-09-24):
 *   The server now normalizes all responses via adapters/index.ts.
 *   The client just consumes the normalized shapes below — it no longer
 *   reads raw upstream fields that might not exist.
 *
 *   - index-daily:  { date, close, volume? }  (not 'price')
 *   - idx-total:    { date, market_cap }        (not 'idx_total_market_cap')
 *   - foreign-flow: flat array, not { data: [...] }
 *   - top-changes:  { symbol, company_name, price, price_change_pct, ... }
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE_INTRADAY } from "@/lib/query-config";

// ── Server-normalized response shapes ──────────────────────────────────────
// (mirror of server/src/adapters/index.ts — kept in sync manually)

export interface IHSGDailyPoint {
  date: string;    // "YYYY-MM-DD"
  close: number;   // canonical — adapter maps 'price' -> 'close'
  volume?: number;
}

export interface IdxTotalPoint {
  date: string;
  market_cap: number; // canonical — adapter maps 'idx_total_market_cap'
}

export interface ForeignFlowPoint {
  date: string;
  symbol: string;
  net_foreign_inflow: number;  // IDR, positive = net buy
  foreign_share?: number;      // 0-1
}

export interface TopChangeEntry {
  symbol: string;            // .JK stripped by adapter
  company_name: string;
  price: number;              // from last_close_price
  price_change_pct: number;   // decimal, e.g. 0.0124 = +1.24%
  price_change: number | null;
  latest_close_date: string;
}

export interface TopChangesResponse {
  top_gainers: Record<string, TopChangeEntry[]>;
  top_losers: Record<string, TopChangeEntry[]>;
}

// ── Date helpers ───────────────────────────────────────────────────────────
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}
function today(): string {
  return formatDate(new Date());
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/** IHSG daily price series — last 30 trading days. 1 credit, cached 15m/24h. */
export function useIHSGSeries(days = 30) {
  return useQuery({
    queryKey: ["sectors", "index-daily", "ihsg", days],
    queryFn: () =>
      api.sectors.get<IHSGDailyPoint[]>("/index-daily/ihsg/", {
        start: nDaysAgo(days),
        end: today(),
      }),
    ...STALE_INTRADAY,
    // The adapter already normalizes, so select is simpler now
    select: (data) =>
      (Array.isArray(data) ? data : [])
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter((p) => p.close != null)
        .map((p) => ({
          t: p.date.slice(5),   // "MM-DD" for chart label
          value: p.close,
        })) as { t: string; value: number }[],
  });
}

/** IDX total market-cap series — last 30 days. 1 credit. */
export function useIdxTotal(days = 30) {
  return useQuery({
    queryKey: ["sectors", "idx-total", days],
    queryFn: () =>
      api.sectors.get<IdxTotalPoint[]>("/idx-total/", {
        start: nDaysAgo(days),
        end: today(),
      }),
    ...STALE_INTRADAY,
    select: (data) => {
      const series = Array.isArray(data) ? data : [];
      const latest = series.at(-1);
      const prev = series.at(-2);
      const mcap = latest?.market_cap ?? null;
      const prevMcap = prev?.market_cap ?? null;
      const change =
        mcap != null && prevMcap != null
          ? ((mcap - prevMcap) / prevMcap) * 100
          : null;
      return { mcap, change, series };
    },
  });
}

/**
 * IHSG net foreign flow — last 30 days. 1 credit.
 * Server adapter already unwraps { symbol, start, end, data: [...] }.
 */
export function useForeignFlow(days = 30) {
  return useQuery({
    queryKey: ["sectors", "foreign-flow", "ihsg", days],
    queryFn: () =>
      api.sectors.get<ForeignFlowPoint[]>("/foreign-flow/IHSG/", {
        start: nDaysAgo(days),
        end: today(),
      }),
    ...STALE_INTRADAY,
    select: (data) => {
      const series = Array.isArray(data) ? data : [];
      const latest = series.at(-1);

      // MTD cumulative foreign flow (AGENTS.md Feature #2)
      const now = new Date();
      const monthStart = formatDate(
        new Date(now.getFullYear(), now.getMonth(), 1),
      );
      const mtdFlow = series
        .filter((p) => p.date >= monthStart)
        .reduce((sum, p) => sum + (p.net_foreign_inflow ?? 0), 0);

      const last5sum = series
        .slice(-5)
        .reduce((s, p) => s + (p.net_foreign_inflow ?? 0), 0);

      return {
        latest: latest?.net_foreign_inflow ?? null,
        last5sum,
        mtdFlow,
        mtdPositive: mtdFlow >= 0,
        last5Positive: last5sum >= 0,
        series,
      };
    },
  });
}

/**
 * Top gainers & losers for the current session. 2 credits (1d only).
 * Server adapter normalizes field names (name -> company_name, etc).
 */
export function useTopChanges() {
  return useQuery({
    queryKey: ["sectors", "companies", "top-changes", "1d"],
    queryFn: () =>
      api.sectors.get<TopChangesResponse>("/companies/top-changes/", {
        classifications: "top_gainers,top_losers",
        periods: "1d",
      }),
    ...STALE_INTRADAY,
    select: (data) => {
      const gainers = (data?.top_gainers?.["1d"] ?? []).slice(0, 5);
      const losers  = (data?.top_losers?.["1d"]  ?? []).slice(0, 5);

      return { gainers, losers };
    },
  });
}