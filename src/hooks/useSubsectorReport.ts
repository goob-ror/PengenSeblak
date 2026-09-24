/**
 * useSubsectorReport — fetches subsector reports (growth+stability+valuation+
 * market_cap) to compute the Sector Health Index per
 * Features To Be Implemented.md Algoritma 1.
 *
 * Sections chosen (decided with the user): growth, stability, valuation,
 * market_cap = 4 credits per subsector. Cached 6h.
 *
 * SLUG HISTORY: 'telecommunications'->'telecommunication', 'coal'->
 * 'oil-gas-coal', 'heavy-constructions' removed — every 404 was BILLED
 * (404 = lookup ran = 1 credit). All 7 slugs here verified 200 OK against
 * /v2/subsectors/.
 */

import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE_SECTOR } from "@/lib/query-config";
import {
  computeSHIBreakdown,
  deriveTrend,
  interpretDelta,
  type SHIBreakdown,
  type SubsectorReportNormalized,
} from "@/lib/algorithms/shi";

export const SECTOR_SUBSECTOR_MAP: Record<string, { slug: string; code: string }> = {
  Financials:           { slug: "banks",                code: "IDXFINANCE" },
  Technology:           { slug: "software-it-services", code: "IDXTECHNO"  },
  Infrastructure:       { slug: "telecommunication",    code: "IDXINFRA"   },
  "Basic Materials":    { slug: "basic-materials",       code: "IDXBASIC"   },
  Energy:               { slug: "oil-gas-coal",         code: "IDXENERGY"  },
  "Consumer Cyclicals": { slug: "retailing",             code: "IDXCYCLIC"  },
  Transportation:       { slug: "transportation",       code: "IDXTRANS"   },
};

export interface SHIEntry {
  name: string;
  code: string;
  slug: string;
  score: number;
  trend: string;
  deltaText: string;
  growth: number;
  stability: number;
  valuation: number;
  momentum: number;
  isLive: boolean;
  /** True when the full 4-component SHI was computable */
  complete: boolean;
  missing: Array<"growth" | "stability" | "valuation" | "momentum">;
}

export function useSectorHealthScores() {
  const sectors = Object.entries(SECTOR_SUBSECTOR_MAP);

  const queries = useQueries({
    queries: sectors.map(([sectorName, { slug }]) => ({
      queryKey: ["sectors", "subsector-report", slug, "growth,stability,valuation,market_cap"],
      queryFn: () =>
        api.sectors.get<SubsectorReportNormalized>(
          `/subsector/report/${slug}/`,
          { sections: "growth,stability,valuation,market_cap" },
        ),
      ...STALE_SECTOR,
      throwOnError: false,
      retry: false,
    })),
  });

  const results: SHIEntry[] = sectors.map(([sectorName, { slug, code }], i) => {
    const q = queries[i];
    const report = q?.data ?? null;
    const bd: SHIBreakdown | null = report ? computeSHIBreakdown(report) : null;

    // SHI Delta vs the last stored snapshot (localStorage per spec note).
    // Writes today's score only when it changed, to keep storage quiet.
    let deltaText = interpretDelta(null);
    if (bd) {
      const key = `shi:${slug}`;
      try {
        const prevRaw = localStorage.getItem(key);
        const prev = prevRaw == null ? NaN : Number(prevRaw);
        if (Number.isFinite(prev)) deltaText = interpretDelta(bd.score - prev);
        if (prevRaw !== String(bd.score)) {
          localStorage.setItem(key, String(bd.score));
        }
      } catch {
        // localStorage unavailable — non-fatal
      }
    }

    return {
      name: sectorName,
      code,
      slug,
      score: bd?.score ?? 0,
      trend: report ? deriveTrend(report) : "—",
      deltaText,
      growth: bd?.growth ?? 0,
      stability: bd?.stability ?? 0,
      valuation: bd?.valuation ?? 0,
      momentum: bd?.momentum ?? 0,
      isLive: bd != null,
      complete: bd?.complete ?? false,
      missing: bd?.missing ?? ["growth", "stability", "valuation", "momentum"],
    };
  });

  const isLoading = queries.some((q) => q?.isPending);
  const isError = queries.every((q) => q?.isError);
  const anyLive = results.some((r) => r.isLive);

  return { results, isLoading, isError, anyLive };
}
