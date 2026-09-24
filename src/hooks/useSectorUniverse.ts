/**
 * useSectorUniverse — dynamic sector + company universe for Intelijen Sektor.
 * ==========================================================================
 *
 * DESIGN PRINCIPLE: nothing here is hardcoded. The sector list comes from
 * GET /v2/subsectors/ (the API's own authoritative list, cached 7 days on the
 * server). When IDX adds a sector or the API exposes a new subsector, it shows
 * up in the dropdown automatically — no code change, no redeploy.
 *
 * EFFICIENCY: every subscriber of this hook shares ONE TanStack Query cache
 * entry per subsector, so switching tabs doesn't re-spend credits. The server
 * additionally caches each screener page for 6h (STALE_SECTOR).
 *
 * ENDPOINTS (through our Express proxy /api/sectors/*):
 *   GET /v2/subsectors/          -> [{ sector, sub_sector }]  (1 credit, 7d cache)
 *   GET /v2/subsector/report/{slug}/  -> growth / stability / valuation / market_cap
 *   GET /v2/companies/?where=... -> company fundamentals (1 credit / page)
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { STALE_SECTOR } from "@/lib/query-config";

// ── Types ──────────────────────────────────────────────────────────────────

/** One entry of the API's /subsectors/ list.
 *
 * FIELD NAME IS UNVERIFIED: the docs list no response schema for this endpoint,
 * and our server-side warmer reads `subsector` while the parent field may be
 * named `sector` or `sub_sector`. Rather than guess (a wrong key = silently
 * empty dropdown), normalization accepts every known spelling.
 */
export interface SubsectorEntry {
  sector?: string;
  subsector?: string;
  sub_sector?: string;
  [key: string]: unknown;
}

/** Pulls whichever known spelling is present, or null if none. */
function pickField(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** A company row from the screener, normalized for display. */
export interface UniverseRow {
  symbol: string;          // "BBCA" (.JK stripped)
  company_name: string;
  last_close_price: number | null;
  daily_close_change: number | null;   // decimal, 0.0124 = +1.24%
  market_cap: number | null;
  pe_ttm: number | null;
  roe_ttm: number | null;
  der_mrq: number | null;
  net_profit_margin: number | null;
}

export interface UniverseSector {
  subSector: string;   // display name used in the screener `where`
  slug: string;        // report slug
  sectorName: string;  // parent sector display name
}

// ── 1. The authoritative sector list ───────────────────────────────────────

/**
 * Dynamic sector list straight from the API. Cached 7 days server-side, so
 * this costs ~1 credit per week and self-updates as the universe changes.
 */
export function useSubsectorList() {
  return useQuery({
    queryKey: ["sectors", "subsectors-list"],
    queryFn: () => api.sectors.get<SubsectorEntry[]>("/subsectors/"),
    ...STALE_SECTOR,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days — matches server TTL
    retry: false,
    select: (rows) => {
      const list = Array.isArray(rows) ? rows : [];
      const seen = new Set<string>();
      return list
        .map((r) => {
          const obj = (r ?? {}) as Record<string, unknown>;
          const slug = pickField(obj, ["subsector", "sub_sector"]) ?? "";
          const sectorName = pickField(obj, ["sector", "sub_sector"]) ?? slug;
          return { subSector: slug, slug, sectorName };
        })
        .filter((r) => r.slug)
        .filter((r) => {
          if (seen.has(r.slug)) return false;
          seen.add(r.slug);
          return true;
        })
        .sort((a, b) => a.sectorName.localeCompare(b.sectorName) ||
                        a.subSector.localeCompare(b.subSector));
    },
  });
}

// ── 2. Human-readable label from a slug ────────────────────────────────────

/** "software-it-services" -> "Software It Services" (fallback display name). */
export function slugToLabel(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── 3. Company universe for one subsector ──────────────────────────────────

const SCREENER_LIMIT = 30;
const MAX_PAGES = 3; // cap cost: 3 credits max per subsector

interface ScreenerApiRow {
  symbol: string;
  company_name: string;
  query_values?: Record<string, unknown>;
}

interface ScreenerEnvelope {
  results?: ScreenerApiRow[];
  pagination?: { has_next?: boolean };
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * IMPORTANT (learned the hard way): the screener matches `sub_sector` against
 * DISPLAY NAMES ("Basic Materials"), NOT kebab slugs ("basic-materials").
 * A slug form silently returns zero rows. We therefore take the display name
 * as the input here and let the caller pass whatever the list provided.
 *
 * der_mrq is named without a range filter — banks have null DER, and adding
 * `der_mrq >= 0` would drop every bank row.
 */
async function fetchUniversePage(
  displayName: string,
  offset: number,
  marginYear: number,
): Promise<UniverseRow[]> {
  const where =
    `sub_sector='${displayName}' and market_cap > 0 ` +
    `and net_profit_margin[${marginYear}] > -100`;

  const env = await api.sectors.get<ScreenerEnvelope>("/companies/", {
    where,
    limit: SCREENER_LIMIT,
    offset,
    include_query_values: "true",
    order_by: "-market_cap",
  });

  return (env.results ?? []).map((r) => {
    const q = r.query_values ?? {};
    return {
      symbol: (r.symbol ?? "").replace(/\.JK$/i, ""),
      company_name: r.company_name ?? "",
      last_close_price: num(q["last_close_price"]),
      daily_close_change: num(q["daily_close_change"]),
      market_cap: num(q["market_cap"]),
      pe_ttm: num(q["pe_ttm"]),
      roe_ttm: num(q["roe_ttm"]),
      der_mrq: num(q["der_mrq"]),
      net_profit_margin: num(q[`net_profit_margin[${marginYear}]`]),
    };
  });
}

/**
 * Companies in one subsector, sorted by market cap desc.
 * Costs up to 3 credits the first time, then 0 for 6h (server cache).
 */
export function useSectorUniverse(displayName: string | undefined) {
  return useQuery({
    queryKey: ["sectors", "universe", displayName],
    enabled: !!displayName,
    retry: false,
    ...STALE_SECTOR,
    queryFn: async () => {
      const marginYear = new Date().getFullYear() - 1;
      const rows: UniverseRow[] = [];
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await fetchUniversePage(displayName!, offset, marginYear);
        if (batch.length === 0) break;
        rows.push(...batch);
        offset += SCREENER_LIMIT;
        if (batch.length < SCREENER_LIMIT) break; // short page = last page
      }
      // De-duplicate overlapping pages
      const best = new Map<string, UniverseRow>();
      for (const r of rows) if (!best.has(r.symbol)) best.set(r.symbol, r);
      return Array.from(best.values());
    },
  });
}

// ── 4. Growth history for the chart ────────────────────────────────────────

export interface GrowthYear {
  year: string;
  revenue: number | null;   // percent, e.g. 12.4
  earnings: number | null;
}

/**
 * Yearly revenue / earnings growth for one subsector, pulled from the same
 * report the SHI already fetched. The value arrives as a DECIMAL
 * (0.124 = 12.4%) upstream, so we scale to percent for display.
 *
 * Skips implausible years — the upstream feed has known artefacts
 * (e.g. transportation 2025 reported avg_annual_revenue_growth = 61399, which
 * is 6.1 million percent). Anything beyond +/-500% is treated as bad data.
 */
export function useSectorGrowthHistory(slug: string | undefined) {
  return useQuery({
    queryKey: ["sectors", "subsector-growth", slug],
    enabled: !!slug,
    retry: false,
    ...STALE_SECTOR,
    queryFn: async () => {
      const raw = await api.sectors.get<Record<string, unknown>>(
        `/subsector/report/${slug}/`,
        { sections: "growth" },
      );
      const growthSection = raw["growth"] as
        | { weighted_avg_growth_data?: Record<string, {
            avg_annual_revenue_growth?: number | null;
            avg_annual_earning_growth?: number | null;
          }> }
        | undefined;
      const growthMap = growthSection?.weighted_avg_growth_data;

      const out: GrowthYear[] = [];
      for (const [year, v] of Object.entries(growthMap ?? {})) {
        let rev = v?.avg_annual_revenue_growth;
        let earn = v?.avg_annual_earning_growth;
        // guard: implausible upstream artefacts
        if (rev != null && Math.abs(rev) > 5) rev = null;
        if (earn != null && Math.abs(earn) > 5) earn = null;
        out.push({
          year,
          revenue: rev == null ? null : rev * 100,
          earnings: earn == null ? null : earn * 100,
        });
      }
      return out.sort((a, b) => a.year.localeCompare(b.year));
    },
  });
}
