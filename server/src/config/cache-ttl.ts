/**
 * TTL (seconds) and credit cost per Sectors API endpoint category.
 * Aligned with AGENTS.md 6-layer caching strategy.
 *
 * TTL rules:
 *  - Fundamental/annual data  → 24 h  (won't change intraday)
 *  - Sector aggregates        →  6 h  (recomputed daily, stable)
 *  - Intraday price/volume    → 15 min during market hours
 *  - Foreign flow             → 15 min
 *  - Broker activity          → 30 min
 *  - News                     →  5 min (most volatile)
 *  - Corporate actions        →  1 h  (scheduled, stable)
 *  - Suspensions              → 10 min (can happen any time)
 *  - Static lists (tags, etc) →  7 d
 */

export const TTL = {
  // Annual / fundamental
  companyReport:        24 * 60 * 60,   // 24 h
  companyFinancials:    24 * 60 * 60,
  companyValuation:     24 * 60 * 60,
  companyPeers:         24 * 60 * 60,

  // Sector aggregates
  subsectorReport:       6 * 60 * 60,   // 6 h
  sectorList:            6 * 60 * 60,

  // Intraday price (market open: 09:00–16:00 WIB)
  dailyPrice:           15 * 60,        // 15 min
  dailyPriceClosed:     24 * 60 * 60,   // 24 h after close

  // Flow & activity
  foreignFlow:          15 * 60,        // 15 min
  brokerSummary:        30 * 60,        // 30 min
  brokerTop:            30 * 60,

  // News
  news:                  5 * 60,        // 5 min

  // Events
  corporateActions:     60 * 60,        // 1 h
  suspensions:          10 * 60,        // 10 min

  // Static / reference
  subsectorList:         7 * 24 * 60 * 60, // 7 d
  tags:                  7 * 24 * 60 * 60,
  companyList:           6 * 60 * 60,   // refreshes with new listings
} as const;

export type TtlKey = keyof typeof TTL;

/**
 * Estimated credit cost per Sectors API call.
 * Source: Sectors API v2 docs.  Update as pricing changes.
 */
export const CREDIT_COST: Record<string, number> = {
  "company/report":     8,   // full report (all sections)
  "company/report/overview":    1,
  "company/report/valuation":   1,
  "company/report/financials":  2,
  "company/report/peers":       1,
  "company/report/management":  1,
  "subsector/report":   3,
  "daily":              1,
  "foreign-flow":       1,
  "broker-summary":     2,
  "brokers/top":        2,
  "news":               1,
  "corporate-actions":  1,
  "suspensions":        1,
  "subsectors":         1,
  "tags":               1,
  "companies":          1,
  "index-daily":        1,
  "idx-total":          1,
  "most-traded":        2,
};

/**
 * Computes the ACTUAL credit cost of a request, accounting for params that
 * change the price. Sectors bills 1 credit per section / classification /
 * type, so a bare CREDIT_COST lookup would under-count.
 *
 *   /v2/company/report/BBCA/?sections=overview,valuation  → 2 (not 8)
 *   /v2/subsector/report/banks/?sections=growth,stability → 2 (not 6)
 *   /v2/companies/top-changes/?classifications=top_gainers&periods=1d → 1
 *   /v2/corporate-actions/?type=dividend                  → 1 (not 7)
 */
export function computeCreditCost(
  adapter: string,
  baseCost: number,
  query: Record<string, unknown>,
): number {
  if (adapter === "company-report") {
    const sections = query["sections"] as string | undefined;
    if (sections) {
      const n = sections.split(",").map((s) => s.trim()).filter(Boolean).length;
      // financials is 2 credits, rest are 1
      const hasFinancials = sections.includes("financials");
      return Math.min(n + (hasFinancials ? 1 : 0), 8);
    }
    return baseCost; // no sections param = all 8
  }

  if (adapter === "subsector-report") {
    const sections = query["sections"] as string | undefined;
    if (sections) {
      const n = sections.split(",").map((s) => s.trim()).filter(Boolean).length;
      return Math.min(n, 6);
    }
    return baseCost; // no sections = all 6
  }

  if (adapter === "companies-top-changes") {
    const classifications = query["classifications"] as string | undefined;
    const periods = query["periods"] as string | undefined;
    const nc = classifications
      ? classifications.split(",").map((s) => s.trim()).filter(Boolean).length
      : 2; // default both
    const np = periods
      ? periods.split(",").map((s) => s.trim()).filter(Boolean).length
      : 5; // default all 5
    return nc * np;
  }

  if (adapter === "corporate-actions") {
    const type = query["type"] as string | undefined;
    if (type) {
      return type.split(",").map((s) => s.trim()).filter(Boolean).length;
    }
    return 7; // default all 7 types
  }

  return baseCost;
}

/**
 * Sections supported by the company report endpoint.
 * Only request sections needed for each page — saves credits.
 * 
 * Full report costs 8 credits (all 8 sections).
 * By requesting only needed sections, we save significant API credits.
 * 
 * Available sections:
 *   - overview (1 credit): company name, sector, market cap, indices, tags
 *   - valuation (1 credit): PE, PB, PS, PCF, intrinsic value
 *   - financials (2 credits): income statement, balance sheet, cash flow
 *   - peers (1 credit): peer comparison data
 *   - management (1 credit): board of directors, commissioners
 *   - future (1 credit): analyst forecasts, growth estimates
 *   - ownership (1 credit): shareholder composition
 *   - dividend (1 credit): dividend history, yield
 */
export const REPORT_SECTIONS = {
  // Dashboard market overview — no company report needed
  marketOverview:   [] as string[],

  // Sector deep-dive: list of companies in sector, basic fundamentals
  sectorDeepdive:   ["overview", "valuation"],

  // Company terminal overview card (minimal, just the basics)
  companyOverview:  ["overview", "valuation"],

  // Company terminal financial analysis (need detailed financials)
  companyFinancials: ["overview", "financials", "valuation"],

  // Company terminal peer comparison
  companyPeers:     ["overview", "valuation", "peers"],

  // Company terminal full profile (comprehensive view)
  companyFull:      ["overview", "valuation", "financials", "peers", "future"],

  // Screener — needs fundamentals for filtering and decision labels
  screener:         ["overview", "valuation", "financials"],

  // Dominance Score calculation (need financials + peers for ranking)
  dominanceScore:   ["overview", "valuation", "financials", "peers"],

  // Financial Safety Score (need detailed financials for Altman Z / Piotroski F)
  financialSafety:  ["overview", "financials"],
} as const;

/**
 * Sections parameter string builder
 * Converts array of section names to comma-separated string for API call
 */
export function buildSectionsParam(sections: readonly string[]): string | undefined {
  return sections.length > 0 ? sections.join(",") : undefined;
}

/**
 * Returns whether the Jakarta market is currently open.
 * IDX hours: Mon–Fri 09:00–11:30, 13:30–15:50 WIB (UTC+7).
 * Pre/post sessions excluded for simplicity.
 */
export function isMarketOpen(): boolean {
  const now = new Date();
  const jakartaOffset = 7 * 60; // UTC+7 in minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const jakartaMinutes = utcMinutes + jakartaOffset;
  const jakartaHHMM = jakartaMinutes % (24 * 60);
  const day = now.getUTCDay(); // 0=Sun, 6=Sat — adjusted for Jakarta
  const jakartaDay = ((day * 24 * 60 + jakartaOffset) / (24 * 60)) % 7 | 0;

  if (jakartaDay === 0 || jakartaDay === 6) return false; // weekend

  const session1Open  = 9 * 60;
  const session1Close = 11 * 60 + 30;
  const session2Open  = 13 * 60 + 30;
  const session2Close = 15 * 60 + 50;

  return (
    (jakartaHHMM >= session1Open && jakartaHHMM < session1Close) ||
    (jakartaHHMM >= session2Open && jakartaHHMM < session2Close)
  );
}

/** Returns the correct daily-price TTL based on market hours. */
export function getDailyPriceTTL(): number {
  return isMarketOpen() ? TTL.dailyPrice : TTL.dailyPriceClosed;
}
