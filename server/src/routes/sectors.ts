/**
 * Sectors API proxy — server/src/routes/sectors.ts
 * ==========================================================================
 * All routes under /api/sectors/* are forwarded to api.sectors.app/v2/*.
 *
 * Credit-saving pipeline (AGENTS.md 6-layer defence):
 *   0. LOCAL VALIDATION (new): request validated against endpoint-registry.
 *      Invalid paths/params/slugs -> 400 (free). Prevents 404 credit burn.
 *   1. Redis cache (Lapis 1)     — primary, TTL per endpoint
 *   1b. File cache with TTL              — Redis fallback, no more stale-forever
 *   3. In-flight dedup                   — concurrent identical requests share 1 call
 *   6. Credit budget guard               — 503 at 100%, stale-only at 90%
 *
 * Auth: requires a valid JWT (authenticate applied at the top of this router).
 * force_refresh: blocked when budget is stale-only or exhausted.
 *
 * Response normalization: adapters map upstream shapes to stable internal
 * types, so the client never sees renamed/missing fields.
 */

import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { getRedis } from "../config/redis";
import {
  matchEndpoint,
  validateQueryParams,
  setValidSubsectors,
} from "../config/endpoint-registry";
import { computeCreditCost } from "../config/cache-ttl";
import { adapt } from "../adapters";
import {
  readFromCache,
  writeToCache,
  withDedup,
  checkCreditBudget,
  logCreditUsage,
  buildCacheKey,
  getBudgetGauge,
} from "../cache/cache";
import { logApiResponse } from "../utils/api-logger";

const router = Router();

// ── Auth gate: every sector proxy route requires a valid JWT ──────────────
router.use(authenticate);

// ── Admin: credit gauge (must precede the catch-all) ──────────────────────
router.get("/_admin/credit", async (_req: Request, res: Response): Promise<void> => {
  const gauge = await getBudgetGauge();
  res.json({
    success: true,
    used_today: gauge.usedToday,
    limit: gauge.limit,
    remaining: Math.max(0, gauge.limit - gauge.usedToday),
    pct: Math.round((gauge.usedToday / gauge.limit) * 100),
    stale_only: gauge.staleOnly,
    blocked: gauge.blocked,
  });
});

// ── Warm valid subsectors from Redis on startup ─────────────────────────
async function warmSubsectors(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const cached = await redis.get(buildCacheKey("/subsectors/", {}));
    if (!cached) return;
    const parsed = JSON.parse(cached) as unknown;
    if (!Array.isArray(parsed)) return;
    const slugs = parsed
      .map((x) =>
        x && typeof x === "object"
          ? (x as Record<string, unknown>)["subsector"]
          : null,
      )
      .filter((s): s is string => typeof s === "string");
    if (slugs.length > 0) {
      setValidSubsectors(slugs);
      console.log(`[SECTORS] Warmed ${slugs.length} valid subsectors from Redis`);
    }
  } catch {
    // Non-fatal — fallback set is used until /v2/subsectors/ is fetched
  }
}

// ── Upstream fetch + cache write + logging ────────────────────────────────
async function fetchUpstream(
  apiBaseUrl: string,
  apiKey: string,
  reqPath: string,
  queryParams: Record<string, unknown>,
  adapter: string,
  ttl: number,
  creditCost: number,
): Promise<unknown> {
  const qs = new URLSearchParams(queryParams as Record<string, string>).toString();
  const targetUrl = `${apiBaseUrl}${reqPath}${qs ? `?${qs}` : ""}`;

  console.log(`[SECTORS_API] Fetching -> ${targetUrl}`);
  const startTime = Date.now();

  const upstream = await fetch(targetUrl, {
    method: "GET",
    headers: {
      // Sectors API v2: raw key, no Bearer prefix
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
  });

  const responseTime = Date.now() - startTime;

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error(`[SECTORS_API] ${upstream.status} ${upstream.statusText}: ${errText}`);

    // Log the failed call — Sectors bills 404s too
    void logCreditUsage(
      reqPath, creditCost, false, queryParams, upstream.status, upstream.statusText,
    );

    throw Object.assign(new Error(`Sectors API: ${upstream.statusText}`), {
      status: upstream.status,
      upstreamError: errText,
    });
  }

  const data = (await upstream.json()) as unknown;

  // Write to Redis + file cache (with TTL metadata)
  await writeToCache(reqPath, queryParams, data, ttl);

  // Log response for development reuse (api-logs)
  void logApiResponse(reqPath, queryParams, data, {
    http_status: upstream.status,
    credits_used: creditCost,
    cache_hit: false,
    response_time_ms: responseTime,
  });

  void logCreditUsage(reqPath, creditCost, false, queryParams, upstream.status);

  // Side effect: warm the subsector validator when /v2/subsectors/ is fetched
  if (adapter === "subsectors-list" && Array.isArray(data)) {
    const slugs = data
      .map((x) =>
        x && typeof x === "object"
          ? (x as Record<string, unknown>)["subsector"]
          : null,
      )
      .filter((s): s is string => typeof s === "string");
    if (slugs.length > 0) {
      setValidSubsectors(slugs);
      console.log(`[SECTORS] Updated ${slugs.length} valid subsectors from API`);
    }
  }

  return data;
}

// ── Main proxy handler (catch-all) ────────────────────────────────────────
router.get(/.*/, async (req: Request, res: Response): Promise<void> => {
  const apiBaseUrl = process.env.SECTORS_API_BASE_URL ?? "https://api.sectors.app/v2";
  const apiKey = process.env.SECTORS_API_KEY;

  // ── Layer 0: local validation — prevents 404 credit burn ───────────────
  const match = matchEndpoint(req.path);
  if (!match) {
    res.status(400).json({
      success: false,
      message: `Endpoint tidak valid atau parameter tidak dikenal: ${req.path}`,
      hint: "Request ditolak secara lokal - tidak ada kredit API terpakai.",
    });
    return;
  }

  const queryError = validateQueryParams(match.adapter, req.query);
  if (queryError) {
    res.status(400).json({
      success: false,
      message: queryError,
      hint: "Parameter tidak valid - tidak ada kredit API terpakai.",
    });
    return;
  }

  const forceRefresh = req.query["force_refresh"] === "true";

  // Strip internal flags before forwarding upstream / building cache key
  const queryParams: Record<string, unknown> = { ...req.query };
  delete queryParams["force_refresh"];

  // Real credit cost (accounts for sections / classifications / types)
  const creditCost = computeCreditCost(match.adapter, match.creditCost, queryParams);

  // ── Layers 1 / 1b / fallback: try cache before going upstream ──────────
  const cacheResult = await readFromCache({
    reqPath: req.path,
    query: queryParams,
    ttl: match.ttl,
    creditCost,
    forceRefresh,
    allowLoggedFallback: !apiKey,
  });

  if (cacheResult.source !== "none") {
    // Normalize on the way out too - cached data may predate the adapters
    const normalized = adapt(match.adapter, cacheResult.data);
    res.setHeader("X-Cache", cacheResult.source.toUpperCase());
    res.json(normalized);
    return;
  }

  // ── No API key and nothing cached? Can't fetch. ────────────────────────
  if (!apiKey) {
    res.status(503).json({
      success: false,
      message: "SECTORS_API_KEY belum dikonfigurasi dan data tidak tersedia di cache.",
      hint: "Set SECTORS_API_KEY in .env, or data will be served from cache/logs when available.",
    });
    return;
  }

  // ── Layer 6: credit budget guard ────────────────────────────────────────
  let budget: { staleOnly: boolean };
  try {
    budget = await checkCreditBudget();
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ success: false, message: (err as Error).message });
    return;
  }

  // In stale-only mode we already tried cache above; nothing was found.
  // Refuse rather than burn credits.
  if (budget.staleOnly) {
    res.status(503).json({
      success: false,
      message:
        "CREDIT_LIMIT_WARNING: Budget >= 90% - mode stale-only aktif, dan tidak ada data cache untuk endpoint ini.",
      hint: "Coba lagi setelah midnight WIB saat budget harian reset.",
    });
    return;
  }

  // ── Layer 3: dedup - concurrent identical requests share one call ──────
  try {
    const cacheKey = buildCacheKey(req.path, queryParams);
    const data = await withDedup(cacheKey, () =>
      fetchUpstream(
        apiBaseUrl, apiKey, req.path, queryParams,
        match.adapter, match.ttl, creditCost,
      ),
    );

    const normalized = adapt(match.adapter, data);
    res.setHeader("X-Cache", "MISS");
    res.json(normalized);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message =
      err instanceof Error ? err.message : "Gagal mengambil data dari Sectors API.";
    // Pass upstream status through - don't swallow 429 / 503
    res.status(status).json({
      success: false,
      message,
      upstream_status: status,
    });
  }
});

warmSubsectors().catch(console.warn);

export default router;