/**
 * USD/IDR rate via frankfurter.app — replaces forex data the Sectors API
 * does not provide.
 * ==========================================================================
 * WHY THIS EXISTS:
 *   Features To Be Implemented.md — Bagian 3 Gap 1 (Macro Pulse Panel) asks
 *   for "USD / IDR Trend | External / Screener | Perubahan % 30 hari".
 *   The Sectors API has NO forex endpoint (verified against the full endpoint
 *   list in Sectors API Endpoints Reference.md — zero match for USD/IDR/
 *   forex/currency/kurs/macro). So this must come from an external source.
 *
 * SOURCE: https://api.frankfurter.app — ECB reference rates. Free, no API
 *   key, no rate limit. Returns business-day rates (no weekends/holidays).
 *
 * WHAT WE EXPOSE: current rate + % change over the past 7 days (the user's
 *   requested "past week" window), so the dashboard can show a small stat
 *   card with a positive/negative label.
 *
 * CACHING: 1 hour server-side. FX doesn't move meaningfully intraday for a
 *   dashboard signal, and this keeps us to ~24 external calls/day.
 */

import { Router, Request, Response } from "express";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────
interface FxPoint {
  date: string; // YYYY-MM-DD
  rate: number;
}

export interface UsdIdrResponse {
  current: number | null;
  currentDate: string | null;
  weekAgoRate: number | null;
  weekAgoDate: string | null;
  /** percent change over the past 7 days; positive = IDR weakened vs USD */
  changePct7d: number | null;
  /** true = USD strengthened vs IDR (bad for IDX), false = IDR strengthened */
  usdStronger: boolean | null;
  updatedAt: string;
  stale: boolean;
}

// ── In-memory cache (1 hour) ──────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { data: UsdIdrResponse; at: number } | null = null;

const UPSTREAM = "https://api.frankfurter.app";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch USD→IDR rates covering the last `days` calendar days.
 * frankfurter returns only business days, so we request a window and pick
 * the most recent + earliest available rows.
 */
async function fetchUsdIdr(days = 14): Promise<UsdIdrResponse> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const url = `${UPSTREAM}/${isoDate(start)}..${isoDate(end)}?from=USD&to=IDR`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`frankfurter HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      rates?: Record<string, { IDR?: number }>;
    };

    const points: FxPoint[] = Object.entries(json.rates ?? {})
      .map(([date, v]) => ({ date, rate: v?.IDR ?? NaN }))
      .filter((p) => Number.isFinite(p.rate))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (points.length === 0) {
      throw new Error("no usable rate rows");
    }

    const latest = points[points.length - 1];

    // Pick the OLDEST point still within the past 7 days of the latest quote.
    const latestMs = Date.parse(latest.date);
    const weekAgo = points.find(
      (p) => latestMs - Date.parse(p.date) <= 7 * 24 * 60 * 60 * 1000,
    );

    // Fall back to the oldest available if the window has <1 business day
    const base = weekAgo ?? points[0];

    const changePct7d =
      latest.date === base.date
        ? null
        : ((latest.rate - base.rate) / base.rate) * 100;

    return {
      current: latest.rate,
      currentDate: latest.date,
      weekAgoRate: base.rate,
      weekAgoDate: base.date,
      changePct7d,
      usdStronger: changePct7d == null ? null : changePct7d > 0,
      updatedAt: new Date().toISOString(),
      stale: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GET /api/fx/usd-idr
 * Current USD/IDR + 7-day change. Cached 1h server-side.
 * Never throws — degrades to `stale: true` with the last good value, or
 * null fields if we have nothing at all. The UI renders "—" rather than
 * inventing a number.
 */
router.get("/usd-idr", async (_req: Request, res: Response) => {
  // Fresh cache hit
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    res.json({ success: true, data: cache.data });
    return;
  }

  try {
    const data = await fetchUsdIdr();
    cache = { data, at: Date.now() };
    res.json({ success: true, data });
  } catch (err) {
    // Upstream failed — serve stale if we have it, else report unavailable
    if (cache) {
      res.json({
        success: true,
        data: { ...cache.data, stale: true },
      });
      return;
    }

    console.error(
      `[FX] USD/IDR fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(503).json({
      success: false,
      message: "Kurs USD/IDR tidak tersedia saat ini.",
      data: null,
    });
  }
});

export default router;
