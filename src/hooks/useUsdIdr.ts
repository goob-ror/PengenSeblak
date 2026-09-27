/**
 * useUsdIdr — USD/IDR exchange rate + 7-day trend.
 * ==========================================================================
 * WHY THIS EXISTS:
 *   Features To Be Implemented.md — Bagian 3 Gap 1 (Macro Pulse Panel) asks
 *   for USD/IDR trend. The Sectors API has NO forex endpoint (verified —
 *   zero matches across the whole endpoint reference), so this data comes
 *   from our own server route /api/fx/usd-idr, which proxies frankfurter.app
 *   (ECB reference rates, free, no key) with a 1-hour server-side cache.
 *
 * CREDITS: zero Sectors API credits — this endpoint is entirely external.
 *
 * SEMANTICS: for USD/IDR a RISE means the rupiah WEAKENED (more IDR per
 * USD). The dashboard stat card uses `usdStronger` to pick tone:
 *   USD stronger (IDR melemah)  → negative tone (generally bearish for IDX)
 *   USD weaker (IDR menguat)    → positive tone
 * …matching how the market reads FX, not the raw sign of the change.
 */

import { useQuery } from "@tanstack/react-query";

export interface UsdIdrData {
  current: number | null;
  currentDate: string | null;
  weekAgoRate: number | null;
  weekAgoDate: string | null;
  /** percent change over past 7 days; positive = IDR weakened */
  changePct7d: number | null;
  usdStronger: boolean | null;
  updatedAt: string;
  stale: boolean;
}

interface UsdIdrEnvelope {
  success: boolean;
  data: UsdIdrData | null;
}

export function useUsdIdr() {
  return useQuery<UsdIdrData | null, Error, UsdIdrData | null>({
    queryKey: ["fx", "usd-idr"],
    queryFn: async () => {
      const res = await fetch("/api/fx/usd-idr");
      const json = (await res.json()) as UsdIdrEnvelope;
      if (!res.ok || !json.success) {
        throw new Error(json.success === false ? "FX endpoint unavailable" : "FX fetch failed");
      }
      return json.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour — matches the server cache
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
