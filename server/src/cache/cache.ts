/**
 * Unified cache layer — Redis → file (with TTL) → logged fallback.
 * ==========================================================================
 * Replaces both:
 *   - middleware/cache.ts withCache()  (was dead code — never imported)
 *   - inline cache logic in routes/sectors.ts
 *
 * Features:
 *   - Deterministic cache key (sha1 of path + sorted query)
 *   - Redis primary with configurable TTL per endpoint
 *   - File-system fallback with TTL metadata (no more infinite-stale files)
 *   - In-flight dedup: concurrent identical requests share ONE upstream
 *     call (Lapis 3)
 *   - Logged-fallback: when API key is missing, serve from api-logs
 *   - Stale-only mode: at 90% credit budget, serve expired cache instead
 *     of hitting upstream
 *   - Credit logging on every access (Lapis 6)
 *   - Warms Redis from file cache on a file hit
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import pool from "../config/db";
import { getRedis } from "../config/redis";
import { getLoggedResponse } from "../utils/api-logger";

// ── File cache paths ──────────────────────────────────────────────────────
// __dirname = server/src/cache (dev) or server/dist/cache (prod)
// → ../../data/cache = server/data/cache in both cases
const CACHE_DIR = path.join(__dirname, "../../data/cache");
const META_SUFFIX = ".meta.json";

async function ensureCacheDir(): Promise<void> {
  try { await fs.access(CACHE_DIR); }
  catch { await fs.mkdir(CACHE_DIR, { recursive: true }); }
}
ensureCacheDir().catch(console.error);

interface FileMeta {
  expires_at: number; // epoch ms
  written_at: number;
  endpoint: string;
}

// ── Cache key ─────────────────────────────────────────────────────────────
export function buildCacheKey(reqPath: string, query: Record<string, unknown>): string {
  const sortedQuery = Object.keys(query).sort()
    .map((k) => `${k}=${String(query[k])}`).join("&");
  const raw = `${reqPath}:${sortedQuery}`;
  return `sectors:${crypto.createHash("sha1").update(raw).digest("hex")}`;
}

function fileCachePath(reqPath: string, query: Record<string, unknown>): string {
  const sortedQuery = Object.keys(query).sort()
    .map((k) => `${k}=${String(query[k])}`).join("&");
  const safePath = reqPath.replace(/\//g, "_").replace(/^_|_$/g, "") || "root";
  const hash = crypto.createHash("md5").update(sortedQuery).digest("hex").slice(0, 8);
  const fileName = sortedQuery ? `${safePath}_${hash}` : safePath;
  return path.join(CACHE_DIR, `${fileName}.json`);
}

// ── File cache with TTL ───────────────────────────────────────────────────
async function readFileCache(
  filePath: string,
  allowExpired: boolean,
): Promise<unknown | null> {
  try {
    const metaPath = `${filePath}${META_SUFFIX}`;
    let meta: FileMeta;
    try {
      const metaRaw = await fs.readFile(metaPath, "utf-8");
      meta = JSON.parse(metaRaw) as FileMeta;
    } catch {
      // No metadata → legacy file from the pre-TTL era. Treat as expired
      // so we never serve unbounded-stale data.
      if (!allowExpired) return null;
      meta = { expires_at: 0, written_at: 0, endpoint: "" };
    }

    if (!allowExpired && Date.now() > meta.expires_at) return null;

    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[FILE_CACHE] Read error:", (err as Error).message);
    }
    return null;
  }
}

async function writeFileCache(
  filePath: string,
  data: unknown,
  ttlSeconds: number,
  endpoint: string,
): Promise<void> {
  const meta: FileMeta = {
    expires_at: Date.now() + ttlSeconds * 1000,
    written_at: Date.now(),
    endpoint,
  };
  await Promise.all([
    fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8"),
    fs.writeFile(`${filePath}${META_SUFFIX}`, JSON.stringify(meta, null, 2), "utf-8"),
  ]).catch((err: unknown) => console.warn("[FILE_CACHE] Write error:", (err as Error).message));
}

// ── In-flight dedup (Lapis 3) ─────────────────────────────────────────────
const inFlight = new Map<string, Promise<unknown>>();

export function withDedup<T>(cacheKey: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(cacheKey);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, promise);
  return promise;
}

// ── Credit budget (Lapis 6) ───────────────────────────────────────────────
const DAILY_CREDIT_LIMIT = Number(process.env.DAILY_CREDIT_LIMIT ?? 500);

export interface BudgetState {
  usedToday: number;
  limit: number;
  staleOnly: boolean;
  blocked: boolean;
}

let cachedBudget: BudgetState | null = null;
let budgetCheckedAt = 0;

export function invalidateBudgetCache(): void {
  cachedBudget = null;
  budgetCheckedAt = 0;
}

/** Budget is cached 30s so we don't hit MySQL on every proxied request. */
async function getCreditBudget(): Promise<BudgetState> {
  const now = Date.now();
  if (cachedBudget && now - budgetCheckedAt < 30_000) return cachedBudget;

  try {
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(credits_used), 0) AS used_today
       FROM api_credit_log
       WHERE called_at >= CURDATE() AND cache_hit = 0`,
    );
    const [{ used_today }] = rows as Array<{ used_today: number }>;
    cachedBudget = {
      usedToday: used_today,
      limit: DAILY_CREDIT_LIMIT,
      staleOnly: used_today >= DAILY_CREDIT_LIMIT * 0.9 && used_today < DAILY_CREDIT_LIMIT,
      blocked: used_today >= DAILY_CREDIT_LIMIT,
    };
    budgetCheckedAt = now;
    return cachedBudget;
  } catch (err) {
    console.warn("[CREDIT] Budget check failed, allowing:", (err as Error).message);
    return { usedToday: 0, limit: DAILY_CREDIT_LIMIT, staleOnly: false, blocked: false };
  }
}

// ── Credit logging ────────────────────────────────────────────────────────
export async function logCreditUsage(
  endpoint: string,
  creditsUsed: number,
  cacheHit: boolean,
  queryParams?: Record<string, unknown>,
  httpStatus?: number,
  errorMessage?: string,
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO api_credit_log (endpoint, params, credits_used, cache_hit, http_status, error_message, called_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        endpoint,
        queryParams ? JSON.stringify(queryParams) : null,
        cacheHit ? 0 : creditsUsed,
        cacheHit ? 1 : 0,
        httpStatus ?? null,
        errorMessage ?? null,
      ],
    );
    if (!cacheHit) invalidateBudgetCache();
  } catch {
    // Non-fatal — never let logging break a request
  }
}

// ── Smart invalidation (Lapis 5) ──────────────────────────────────────────
export async function invalidatePattern(pattern: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const keys = await redis.keys(`sectors:*${pattern}*`);
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

// ── Cache read ────────────────────────────────────────────────────────────
export interface CacheReadOptions {
  reqPath: string;
  query: Record<string, unknown>;
  ttl: number;
  creditCost: number;
  forceRefresh: boolean;
  /** Serve from api-logs when nothing else is available (API key missing) */
  allowLoggedFallback?: boolean;
}

export type CacheSource = "redis" | "file" | "logged-fallback" | "none";

export interface CacheReadResult {
  data: unknown;
  source: CacheSource;
}

export async function readFromCache(opts: CacheReadOptions): Promise<CacheReadResult> {
  const {
    reqPath, query, ttl, creditCost, forceRefresh,
    allowLoggedFallback = true,
  } = opts;

  const redis = getRedis();
  const cacheKey = buildCacheKey(reqPath, query);
  const budget = await getCreditBudget();

  // force_refresh bypasses cache — but NOT when budget is exhausted
  if (forceRefresh && !budget.staleOnly && !budget.blocked) {
    return { data: null, source: "none" };
  }

  // ── 1. Redis ──────────────────────────────────────────────────────────
  if (redis && !forceRefresh) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        void logCreditUsage(reqPath, creditCost, true, query);
        return { data: JSON.parse(cached), source: "redis" };
      }
    } catch (err) {
      console.warn("[CACHE] Redis read error:", (err as Error).message);
    }
  }

  // ── 2. File cache (TTL enforced; expired allowed in stale-only mode) ───
  const filePath = fileCachePath(reqPath, query);
  const fileData = await readFileCache(filePath, budget.staleOnly);
  if (fileData !== null) {
    if (redis) {
      redis.setex(cacheKey, ttl, JSON.stringify(fileData))
        .catch((err: Error) => console.warn("[CACHE] Redis warm error:", err.message));
    }
    void logCreditUsage(reqPath, creditCost, true, query);
    return { data: fileData, source: "file" };
  }

  // ── 3. Logged fallback (dev mode when SECTORS_API_KEY is unset) ────────
  if (allowLoggedFallback) {
    const logged = await getLoggedResponse(reqPath, query);
    if (logged?.data) {
      console.log(`[CACHE] Logged fallback: ${reqPath}`);
      return { data: logged.data, source: "logged-fallback" };
    }
  }

  return { data: null, source: "none" };
}

// ── Cache write ───────────────────────────────────────────────────────────
export async function writeToCache(
  reqPath: string,
  query: Record<string, unknown>,
  data: unknown,
  ttl: number,
): Promise<void> {
  const redis = getRedis();
  const cacheKey = buildCacheKey(reqPath, query);

  if (redis) {
    redis.setex(cacheKey, ttl, JSON.stringify(data))
      .catch((err: Error) => console.warn("[CACHE] Redis write error:", err.message));
  }
  // Always write file cache as Redis fallback (with TTL metadata)
  await writeFileCache(fileCachePath(reqPath, query), data, ttl, reqPath);
}

// ── Budget guard ──────────────────────────────────────────────────────────
/**
 * Throws 503 if the credit budget is exhausted.
 * Returns staleOnly=true at ≥90% — callers should then prefer expired cache.
 */
export async function checkCreditBudget(): Promise<{ staleOnly: boolean }> {
  const budget = await getCreditBudget();
  if (budget.blocked) {
    throw Object.assign(
      new Error("CREDIT_LIMIT_REACHED: Semua panggilan API diblokir hari ini."),
      { status: 503 },
    );
  }
  if (budget.staleOnly) {
    console.warn(
      `[CREDIT] ${budget.usedToday}/${budget.limit} kredit terpakai — mode stale-only aktif.`,
    );
  }
  return { staleOnly: budget.staleOnly };
}

/** For the admin credit gauge endpoint. */
export async function getBudgetGauge(): Promise<BudgetState> {
  return getCreditBudget();
}
