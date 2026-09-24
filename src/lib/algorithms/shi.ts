/**
 * shi.ts — Sector Health Index (Features To Be Implemented.md Algoritma 1)
 * ==========================================================================
 * SHI = W1*Growth + W2*Stability + W3*Valuation + W4*Momentum
 * Default weights: W1=0.30 W2=0.25 W3=0.25 W4=0.20
 * Each component is scored 0-25, so the sum is naturally 0-100.
 *
 * INPUT SHAPES ARE DOCUMENTED, NOT GUESSED
 * From Sectors API Documentation.md ("Subsector Report" + worked examples):
 *
 *   growth.weighted_avg_growth_data = { "2024": { avg_annual_revenue_growth,
 *                                                avg_annual_earning_growth }, ... }
 *   stability.weighted_max_drawdown   (negative decimal)
 *   stability.weighted_rsd_close
 *   valuation.historical_valuation    = { "<year>": { pe, pb, ps, pcf }, ... } ← MAP
 *   market_cap.mcap_summary.mcap_change = { "1w", "1y", "ytd" }           ← NESTED
 *
 * NOTE three traps the old code fell into, all verified LIVE 2026-09-24:
 *   - valuation is `historical_valuation`, not `historical_pe` scalar
 *   - the docs show historical_valuation as an ARRAY, but the LIVE API returns
 *     a MAP keyed by year — the server adapter handles BOTH shapes
 *   - momentum lives at mcap_summary.mcap_change["1w"], NOT `mcap_change_1w`
 * Reading the wrong path silently yields null → score 0, so getting these
 * right is not cosmetic, it decides whether the algorithm works at all.
 */

import {
  clamp,
  normalize,
  normalizeInverse,
  to25,
  weightedSum,
  healthLabel,
  toneForScore,
} from "./scoring";

// ── Normalized subsector report shape (mirrors server adapter) ────────────
export interface SubsectorReportNormalized {
  sub_sector?: string;
  sector?: string;
  growth: {
    revenue_growth: number | null;
    earnings_growth: number | null;
    forecast_revenue_growth: number | null;
    forecast_eps_growth: number | null;
    yearly: Array<{ year: string; revenue: number | null; earnings: number | null }>;
  };
  stability: {
    max_drawdown: number | null;
    relative_std_deviation: number | null;
  };
  valuation?: ValuationNormalized | null;
  market_cap?: MarketCapNormalized | null;
  statistics?: StatisticsNormalized | null;
  companies?: unknown;
}

export interface ValuationNormalized {
  /** Latest year with a usable PE, already picked by the adapter. */
  pe: number | null;
  pb: number | null;
  ps: number | null;
  pcf: number | null;
  /** Full yearly series for 5Y percentile / trend work. */
  yearly: Array<{ year: string; pe: number | null; pb: number | null; ps: number | null; pcf: number | null }>;
}

export interface MarketCapNormalized {
  total_market_cap: number | null;
  avg_market_cap: number | null;
  mcap_change_1w: number | null;
  mcap_change_ytd: number | null;
  performance_quantile: number | null;
}

export interface StatisticsNormalized {
  company_count?: number | null;
  median_pe?: number | null;
  weighted_avg_pe?: number | null;
}

// ── Weights & ramp bounds ─────────────────────────────────────────────────
export const SHI_WEIGHTS = {
  growth: 0.3,
  stability: 0.25,
  valuation: 0.25,
  momentum: 0.2,
} as const;

/**
 * Ramp bounds are the calibration knobs. They are deliberately explicit
 * rather than derived from the cross-sector min/max of the moment:
 * a cross-sectional normalize() makes today's scores incomparable to
 * yesterday's, which breaks the SHI Delta trend signal entirely.
 */
const BOUNDS = {
  // Revenue growth -50%..+50% maps to 0..1
  growthLo: -0.5,
  growthHi: 0.5,
  // Max drawdown 0..-60% : shallower is better
  drawdownLo: 0,
  drawdownHi: 0.6,
  // PE inverse: earnings yield 1/PE. 0..15% yield maps 0..1
  earningsYieldLo: 0,
  earningsYieldHi: 0.15,
  // Momentum blend -30%..+30%
  momentumLo: -0.3,
  momentumHi: 0.3,
} as const;

// ── Component scores (each 0..25) ─────────────────────────────────────────

/** Growth: uses revenue growth primarily, earnings as secondary signal. */
export function growthScore(r: SubsectorReportNormalized): number {
  const rev = r.growth?.revenue_growth;
  const earn = r.growth?.earnings_growth;
  // Prefer revenue (the spec's field); fall back to earnings when absent.
  const primary = rev ?? earn;
  return to25(normalize(primary, BOUNDS.growthLo, BOUNDS.growthHi));
}

/** Stability: lower drawdown = better. */
export function stabilityScore(r: SubsectorReportNormalized): number {
  const dd = r.stability?.max_drawdown;
  if (dd == null) return 0;
  const magnitude = Math.abs(dd); // API returns negatives
  return to25(normalizeInverse(magnitude, BOUNDS.drawdownLo, BOUNDS.drawdownHi));
}

/**
 * Valuation: normalize(1/PE) × 25 — inverse PE (earnings yield).
 * Negative PE → 0 per the spec ("Jika PE negatif, skor = 0").
 */
export function valuationScore(r: SubsectorReportNormalized): number {
  const pe = r.valuation?.pe ?? null;
  if (pe == null || !Number.isFinite(pe) || pe <= 0) return 0;
  const earningsYield = 1 / pe;
  return to25(normalize(earningsYield, BOUNDS.earningsYieldLo, BOUNDS.earningsYieldHi));
}

/** Momentum: mcap_change_1w*0.3 + mcap_change_ytd*0.7, per spec. */
export function momentumScore(r: SubsectorReportNormalized): number {
  const w1 = r.market_cap?.mcap_change_1w ?? null;
  const ytd = r.market_cap?.mcap_change_ytd ?? null;
  if (w1 == null && ytd == null) return 0;
  const blend = (w1 ?? 0) * 0.3 + (ytd ?? 0) * 0.7;
  return to25(normalize(blend, BOUNDS.momentumLo, BOUNDS.momentumHi));
}

// ── Composite ─────────────────────────────────────────────────────────────
export interface SHIBreakdown {
  score: number;            // 0-100 composite
  growth: number;           // 0-25
  stability: number;        // 0-25
  valuation: number;        // 0-25
  momentum: number;         // 0-25
  /** True when all four components had usable input data. */
  complete: boolean;
  /** Which components were missing (for honest UI disclosure). */
  missing: Array<"growth" | "stability" | "valuation" | "momentum">;
}

export function computeSHIBreakdown(r: SubsectorReportNormalized): SHIBreakdown {
  const missing: SHIBreakdown["missing"] = [];

  const gMissing = r.growth?.revenue_growth == null && r.growth?.earnings_growth == null;
  const sMissing = r.stability?.max_drawdown == null;
  const vMissing = r.valuation?.pe == null || r.valuation.pe <= 0;
  const mMissing = r.market_cap?.mcap_change_1w == null && r.market_cap?.mcap_change_ytd == null;
  if (gMissing) missing.push("growth");
  if (sMissing) missing.push("stability");
  if (vMissing) missing.push("valuation");
  if (mMissing) missing.push("momentum");

  const growth = growthScore(r);
  const stability = stabilityScore(r);
  const valuation = valuationScore(r);
  const momentum = momentumScore(r);

  // Components are each 0-25 and the spec has them SUM to 0-100
  // (4 components x 25). Weights must therefore be re-normalised to sum to
  // 1 when some components are missing and then scaled back up by 4 —
  // `weightedSum` returns a weighted AVERAGE (still 0-25), so without the
  // *4 the composite could never exceed 25 and every sector would read
  // "Rentan" (see healthLabel thresholds at 45/60/75).
  const parts = [
    { key: "growth" as const, score: growth, weight: gMissing ? 0 : SHI_WEIGHTS.growth },
    { key: "stability" as const, score: stability, weight: sMissing ? 0 : SHI_WEIGHTS.stability },
    { key: "valuation" as const, score: valuation, weight: vMissing ? 0 : SHI_WEIGHTS.valuation },
    { key: "momentum" as const, score: momentum, weight: mMissing ? 0 : SHI_WEIGHTS.momentum },
  ];
  const raw = weightedSum(parts) * 4;

  return {
    score: Math.round(clamp(raw, 0, 100)),
    growth: Math.round(growth * 10) / 10,
    stability: Math.round(stability * 10) / 10,
    valuation: Math.round(valuation * 10) / 10,
    momentum: Math.round(momentum * 10) / 10,
    complete: missing.length === 0,
    missing,
  };
}

// ── Derived display helpers ───────────────────────────────────────────────

export function deriveTrend(r: SubsectorReportNormalized | null | undefined): string {
  const g = r?.growth?.revenue_growth ?? 0;
  if (g > 0.12) return "Menguat";
  if (g > 0.05) return "Stabil";
  if (g > -0.02) return "Campuran";
  if (g > -0.1) return "Melunak";
  return "Melemah";
}

export const shiHealthLabel = healthLabel;
export const shiTone = toneForScore;

/**
 * SHI Delta interpretation (spec): today's score minus the 30-day-ago score.
 * Returns null when there's no history to compare against rather than
 * inventing a 0 delta, which would read as "no change".
 */
export function interpretDelta(delta: number | null): string {
  if (delta == null) return "Data historis belum tersedia";
  if (delta > 2) return "Membaik";
  if (delta < -2) return "Memburuk";
  return "Relatif stabil";
}
