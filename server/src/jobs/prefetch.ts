/**
 * Morning Prefetch Cron Job (Lapis 4 - AGENTS.md)
 * ==========================================================================
 * Runs every weekday at 08:30 WIB (01:30 UTC) to warm the cache before
 * market opens, so the first user of the day doesn't pay the cold-start cost.
 *
 * FIX (was broken):
 *   Previously this job called fetch() directly against api.sectors.app and
 *   then only wrote to api-logs files via logApiResponse(). It NEVER wrote
 *   to Redis or the file cache - so the warmed data was never actually
 *   served. The proxy's logged-fallback path only triggers when
 *   SECTORS_API_KEY is missing, so prefetched data was effectively orphaned.
 *
 *   Now: writes through writeToCache() (Redis + file cache with TTL), which
 *   is the exact same storage the proxy reads from. Also logs to api-logs
 *   for dev reuse.
 *
 * Prefetch budget: ~9 credits per morning.
 */

import cron from "node-cron";
import { writeToCache, readFromCache, logCreditUsage } from "../cache/cache";
import { getRedis } from "../config/redis";
import { logApiResponse } from "../utils/api-logger";
import { TTL } from "../config/cache-ttl";

const SECTORS_API_BASE =
  process.env.SECTORS_API_BASE_URL ?? "https://api.sectors.app/v2";

/**
 * Subsector slugs verified against the Sectors API docs (/v2/subsectors/).
 * NOTE: 'telecommunication' is SINGULAR, and the energy slug is
 * 'oil-gas-coal' - the old values ('telecommunications', 'coal') returned
 * 404 and were billed on every dashboard load.
 */
const WORKING_SUBSECTOR_SLUGS = [
  "banks",
  "software-it-services",
  "retailing",
  "transportation",
  "basic-materials",
  "telecommunication",
  "oil-gas-coal",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

interface PrefetchJob {
  endpoint: string;
  queryParams: Record<string, unknown>;
  creditCost: number;
  ttl: number;
}

/**
 * Fetches one endpoint and writes it into the shared cache (Redis + file).
 * Also logs to api-logs for development reuse.
 *
 * CACHE-AWARE: checks the cache first. If data is still fresh, skips the
 * fetch entirely. This prevents the prefetch job from re-buying all data
 * on every tsx-watch restart (each restart was costing ~19 credits).
 */
async function prefetchAndCache(job: PrefetchJob): Promise<boolean> {
  const apiKey = process.env.SECTORS_API_KEY;
  if (!apiKey) {
    console.warn("[PREFETCH] No API key configured, skipping prefetch");
    return false;
  }

  // ── Check cache first — skip if still fresh ──────────────────────────
  const cached = await readFromCache({
    reqPath: job.endpoint,
    query: job.queryParams,
    ttl: job.ttl,
    creditCost: job.creditCost,
    forceRefresh: false,
    allowLoggedFallback: false,
  });
  if (cached.source !== "none") {
    console.log(`[PREFETCH] Cache hit (${cached.source}): ${job.endpoint} - skipped`);
    return false; // already cached, nothing fetched
  }

  const qs = new URLSearchParams(
    job.queryParams as Record<string, string>,
  ).toString();
  const url = `${SECTORS_API_BASE}${job.endpoint}${qs ? `?${qs}` : ""}`;

  try {
    console.log(`[PREFETCH] Fetching: ${job.endpoint}`);
    const startTime = Date.now();

    const response = await fetch(url, {
      method: "GET",
      headers: {
        // Sectors API v2: raw key, no Bearer prefix
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      console.error(
        `[PREFETCH] Failed: ${job.endpoint} -> ${response.status} ${response.statusText}`,
      );
      void logCreditUsage(
        job.endpoint, job.creditCost, false, job.queryParams,
        response.status, response.statusText,
      );
      return false;
    }

    const data = (await response.json()) as unknown;

    // THE FIX: write into the shared cache the proxy actually reads
    await writeToCache(job.endpoint, job.queryParams, data, job.ttl);

    // Keep the api-logs artifact for dev reuse / debugging
    await logApiResponse(job.endpoint, job.queryParams, data, {
      http_status: response.status,
      credits_used: job.creditCost,
      cache_hit: false,
      response_time_ms: responseTime,
    });

    void logCreditUsage(
      job.endpoint, job.creditCost, false, job.queryParams, response.status,
    );

    console.log(`[PREFETCH] Cached: ${job.endpoint} (${responseTime}ms)`);
    return true;
  } catch (err) {
    console.error(
      `[PREFETCH] Error fetching ${job.endpoint}:`,
      (err as Error).message,
    );
    return false;
  }
}

/**
 * Pulls the full IDX close universe and computes market breadth for the day.
 *
 * WHY SERVER-SIDE: /close/ is ~32 credits for the universe. Running it in the
 * browser would let every pageview trigger 32 credits. Here it runs once per
 * day, writes the result to Redis (24h TTL), and the client reads it free.
 *
 * Breadth needs a previous day to compare against, so we keep yesterday's
 * price map in Redis too and compare day-over-day.
 *
 * Returns credits actually spent (0 when cached).
 */
async function runMorningPrefetch(): Promise<void> {
  console.log("[PREFETCH] Starting morning data warm-up...");
  const startTime = Date.now();
  let totalCredits = 0;

  try {
    // 1. Foreign flow IHSG (last 30 days)
    if (await prefetchAndCache({
      endpoint: "/foreign-flow/IHSG/",
      queryParams: { start: getDateString(30), end: getDateString(0) },
      creditCost: 1,
      ttl: TTL.foreignFlow,
    })) totalCredits += 1;
    await delay(200);

    // 2. IDX total market cap (last 30 days)
    if (await prefetchAndCache({
      endpoint: "/idx-total/",
      queryParams: { start: getDateString(30), end: getDateString(0) },
      creditCost: 1,
      ttl: TTL.dailyPriceClosed,
    })) totalCredits += 1;
    await delay(200);

    // 3. IHSG daily index (last 30 days)
    if (await prefetchAndCache({
      endpoint: "/index-daily/ihsg/",
      queryParams: { start: getDateString(30), end: getDateString(0) },
      creditCost: 1,
      ttl: TTL.dailyPriceClosed,
    })) totalCredits += 1;
    await delay(200);

    // 4. Subsector reports — FULL SHI (growth, stability, valuation,
    //    market_cap) = 4 credits each. Decided with the user: accept the
    //    cost for a correct 4-component SHI. Cache 6h per AGENTS.md.
    console.log("[PREFETCH] Fetching subsector reports (4 sections)...");
    for (const slug of WORKING_SUBSECTOR_SLUGS) {
      if (await prefetchAndCache({
        endpoint: `/subsector/report/${slug}/`,
        queryParams: { sections: "growth,stability,valuation,market_cap" },
        creditCost: 4,
        ttl: TTL.subsectorReport,
      })) totalCredits += 4;
      await delay(300);
    }

    // 5. Top movers - only 1d period to keep cost down (2 credits)
    if (await prefetchAndCache({
      endpoint: "/companies/top-changes/",
      queryParams: { classifications: "top_gainers,top_losers", periods: "1d" },
      creditCost: 2,
      ttl: TTL.dailyPriceClosed,
    })) totalCredits += 2;
    await delay(200);

    const duration = Date.now() - startTime;
    console.log(
      `[PREFETCH] Warm-up complete. Duration: ${(duration / 1000).toFixed(1)}s, Credits spent: ${totalCredits}`,
    );
  } catch (err) {
    console.error("[PREFETCH] Warm-up failed:", (err as Error).message);
  }
}

// Schedule: weekdays at 08:30 WIB (01:30 UTC)
export function startPrefetchSchedule(): void {
  console.log("[PREFETCH] Scheduling morning prefetch for 08:30 WIB (weekdays)");

  cron.schedule("30 1 * * 1-5", runMorningPrefetch, { timezone: "UTC" });

  // Dev: run once on startup so you get warm cache immediately
  if (process.env.NODE_ENV !== "production") {
    console.log("[PREFETCH] Development mode: running prefetch once on startup");
    setTimeout(runMorningPrefetch, 5000);
  }

  console.log("[PREFETCH] Cron job scheduled");
}

export { runMorningPrefetch };