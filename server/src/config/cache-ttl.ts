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
};

/**
 * Sections supported by the company report endpoint.
 * Only request sections needed for each page — saves credits.
 */
export const REPORT_SECTIONS = {
  // Dashboard market overview — no company report needed
  marketOverview:   [] as string[],

  // Sector deep-dive: list of companies in sector, basic fundamentals
  sectorDeepdive:   ["overview", "financials"],

  // Company terminal overview card
  companyOverview:  ["overview", "valuation"],

  // Company terminal full comparison
  companyFull:      ["overview", "valuation", "financials", "peers"],

  // Screener — needs fundamentals for all filters
  screener:         ["overview", "valuation", "financials"],
} as const;

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
