/**
 * TanStack Query client configuration — Lapis 2 (AGENTS.md).
 *
 * staleTime:  how long data is considered "fresh" (no refetch on remount/focus)
 * gcTime:     how long unused data stays in memory before GC
 *
 * Per-query overrides are used for endpoints with different update frequencies:
 *   - Fundamental/annual data  → staleTime 1h,  gcTime 4h
 *   - Sector aggregates        → staleTime 6min, gcTime 30min
 *   - News                     → staleTime 5min, gcTime 15min
 *   - Static lists             → staleTime 7d,   gcTime 7d
 */
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 5 minutes default stale time — data is "fresh" for 5 min after fetch
        staleTime: 5 * 60 * 1000,
        // 30 minutes in-memory retention after component unmount
        gcTime: 30 * 60 * 1000,
        // Retry once on failure (network hiccup), not for 4xx
        retry: (failureCount, error) => {
          const status = (error as { status?: number }).status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 1;
        },
        // Don't refetch when user alt-tabs back — saves API credits
        refetchOnWindowFocus: false,
        // Don't refetch on reconnect for stable data
        refetchOnReconnect: "always",
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// ── Per-category stale/gc time helpers ───────────────────────────────────────
// Import these where you call useQuery() to set appropriate cache duration.

/** Annual fundamental data: company financials, valuation, peers */
export const STALE_FUNDAMENTAL = {
  staleTime: 60 * 60 * 1000,       // 1 hour
  gcTime:    4  * 60 * 60 * 1000,  // 4 hours
} as const;

/** Sector aggregates: sector health, subsector reports */
export const STALE_SECTOR = {
  staleTime: 6  * 60 * 1000,       // 6 minutes
  gcTime:    30 * 60 * 1000,       // 30 minutes
} as const;

/** Intraday data: price, foreign flow */
export const STALE_INTRADAY = {
  staleTime: 15 * 60 * 1000,       // 15 minutes
  gcTime:    30 * 60 * 1000,
} as const;

/** News feed */
export const STALE_NEWS = {
  staleTime: 5  * 60 * 1000,       // 5 minutes
  gcTime:    15 * 60 * 1000,
} as const;

/** Static reference data: list of subsectors, tags, company list */
export const STALE_STATIC = {
  staleTime: 7  * 24 * 60 * 60 * 1000, // 7 days
  gcTime:    7  * 24 * 60 * 60 * 1000,
} as const;