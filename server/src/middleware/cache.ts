/**
 * Server-side Redis cache middleware (Lapis 1 — AGENTS.md).
 *
 * Usage on a route:
 *   router.get("/endpoint", withCache(TTL.subsectorReport, "subsector"), handler)
 *
 * Cache key: deterministic hash of (path + sorted query params).
 * In-flight dedup: if two requests arrive for the same key within the same
 * event-loop tick, only one upstream call is made (Lapis 3 — AGENTS.md).
 *
 * Also exports:
 *   - logCreditUsage(endpoint, credits, cacheHit) — Lapis 6 logging
 *   - invalidatePattern(pattern) — Lapis 5 smart invalidation
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import pool from "../config/db";
import { getRedis } from "../config/redis";

// ── In-flight dedup map (Lapis 3) ────────────────────────────────────────────
// Maps cacheKey → Promise of the upstream response.
// Cleared as soon as the upstream call resolves.
const inFlight = new Map<string, Promise<unknown>>();

// ── Key builder ───────────────────────────────────────────────────────────────
function buildCacheKey(req: Request, prefix = ""): string {
  const sortedQuery = Object.keys(req.query)
    .sort()
    .map((k) => `${k}=${String(req.query[k])}`)
    .join("&");
  const raw = `${prefix}:${req.path}:${sortedQuery}`;
  return `sectors:${crypto.createHash("sha1").update(raw).digest("hex")}`;
}

// ── Credit log (Lapis 6) ──────────────────────────────────────────────────────
export async function logCreditUsage(
  endpoint: string,
  creditsUsed: number,
  cacheHit: boolean,
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO api_credit_log (endpoint, credits_used, cache_hit, called_at)
       VALUES (?, ?, ?, NOW())`,
      [endpoint, cacheHit ? 0 : creditsUsed, cacheHit ? 1 : 0],
    );
  } catch {
    // Non-fatal — don't let logging failure break the request
  }
}

// ── Smart invalidation (Lapis 5) ─────────────────────────────────────────────
export async function invalidatePattern(pattern: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const keys = await redis.keys(`sectors:*${pattern}*`);
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

// ── Cache middleware factory ──────────────────────────────────────────────────
/**
 * @param ttlSeconds  How long to cache the response in Redis.
 * @param prefix      Optional prefix to namespace the cache key.
 * @param creditCost  Credit cost of one upstream call (for logging).
 * @param endpointTag Human-readable name for credit log.
 */
export function withCache(
  ttlSeconds: number,
  prefix = "",
  creditCost = 1,
  endpointTag = "",
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const redis = getRedis();
    const cacheKey = buildCacheKey(req, prefix);
    const tag = endpointTag || req.path;

    // ── 1. Try Redis cache ───────────────────────────────────────────────────
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          void logCreditUsage(tag, creditCost, true);
          res.setHeader("X-Cache", "HIT");
          res.setHeader("X-Cache-Key", cacheKey.slice(0, 16) + "…");
          res.json(JSON.parse(cached) as unknown);
          return;
        }
      } catch (err) {
        console.warn("[CACHE] Redis read error, bypassing cache:", (err as Error).message);
      }
    }

    // ── 2. In-flight dedup ────────────────────────────────────────────────────
    if (inFlight.has(cacheKey)) {
      try {
        const data = await inFlight.get(cacheKey)!;
        res.setHeader("X-Cache", "DEDUP");
        res.json(data as object);
        return;
      } catch (err) {
        // If the in-flight request failed, fall through to next()
        console.warn("[CACHE] In-flight dedup error, falling through:", (err as Error).message);
      }
    }

    // ── 3. Intercept res.json to cache the response ───────────────────────────
    const originalJson = res.json.bind(res);

    // We create a promise that resolves when the handler calls res.json
    let resolveInFlight!: (data: unknown) => void;
    let rejectInFlight!: (err: unknown) => void;
    const inFlightPromise = new Promise<unknown>((resolve, reject) => {
      resolveInFlight = resolve;
      rejectInFlight = reject;
    });
    inFlight.set(cacheKey, inFlightPromise);

    res.json = (body: unknown) => {
      // Write to Redis (fire-and-forget — don't block the response)
      if (redis && body !== null && body !== undefined) {
        redis
          .setex(cacheKey, ttlSeconds, JSON.stringify(body))
          .catch((err: Error) => console.warn("[CACHE] Redis write error:", err.message));
      }

      void logCreditUsage(tag, creditCost, false);
      res.setHeader("X-Cache", "MISS");

      resolveInFlight(body);
      inFlight.delete(cacheKey);

      return originalJson(body);
    };

    // Ensure in-flight map is cleaned up if the handler throws
    res.on("finish", () => {
      if (inFlight.has(cacheKey)) {
        rejectInFlight(new Error("Response finished without calling res.json"));
        inFlight.delete(cacheKey);
      }
    });

    next();
  };
}

// ── Circuit breaker check (Lapis 6) ──────────────────────────────────────────
const DAILY_CREDIT_LIMIT = Number(process.env.DAILY_CREDIT_LIMIT ?? 500);

export async function checkCreditBudget(): Promise<void> {
  try {
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(credits_used), 0) AS used_today
       FROM api_credit_log
       WHERE called_at >= CURDATE() AND cache_hit = 0`,
    );
    const [{ used_today }] = rows as Array<{ used_today: number }>;

    if (used_today >= DAILY_CREDIT_LIMIT) {
      throw Object.assign(
        new Error("CREDIT_LIMIT_REACHED: Semua panggilan API diblokir hari ini."),
        { status: 503 },
      );
    }

    if (used_today >= DAILY_CREDIT_LIMIT * 0.9) {
      console.warn(
        `[CREDIT] Peringatan: ${used_today}/${DAILY_CREDIT_LIMIT} kredit terpakai hari ini (${Math.round((used_today / DAILY_CREDIT_LIMIT) * 100)}%).`,
      );
    }
  } catch (err) {
    // If it's our own budget error, rethrow
    if ((err as { status?: number }).status === 503) throw err;
    // Otherwise (DB error) — don't block the request
    console.warn("[CREDIT] Gagal cek budget, melanjutkan:", (err as Error).message);
  }
}
