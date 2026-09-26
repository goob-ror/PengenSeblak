/**
 * scoring.ts — Shared normalizers & scoring primitives for derived insights.
 * ==========================================================================
 * WHY THIS FILE EXISTS
 *
 * AGENTS.md Rule: "Kamu tidak boleh hanya menampilkan data mentah dari API.
 * Wajib membangun lapisan kalkulasi (derived insight)."
 *
 * Features To Be Implemented.md specifies every score as `normalize(x) * 25`
 * where each component is scored 0-25 and summed with weights. The spec never
 * defines normalize(), so we implement it explicitly here — percentile-free,
 * bounded, and deterministic so scores are comparable across sectors and
 * stable across refreshes (critical: a score that jumps on every cache expiry
 * is useless for spotting trends).
 */

// ── Clamping ──────────────────────────────────────────────────────────────
export function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Maps a raw value into 0..1 using a piecewise-linear ramp between a lower
 * and upper bound. Values at or below `lo` → 0, at or above `hi` → 1.
 *
 * This is the `normalize()` in every Features To Be Implemented.md formula.
 * Bounded ramps are used instead of min/max-vs-peers because a single outlier
 * sector would otherwise compress every other sector's score.
 */
export function normalize(value: number | null | undefined, lo: number, hi: number): number {
  if (value == null || !Number.isFinite(value)) return 0;
  if (hi === lo) return 0;
  return clamp((value - lo) / (hi - lo), 0, 1);
}

/**
 * "Less is better" ramp (e.g. drawdown, volatility, debt).
 * At or below `lo` → 1 (best), at or above `hi` → 0 (worst).
 */
export function normalizeInverse(value: number | null | undefined, lo: number, hi: number): number {
  if (value == null || !Number.isFinite(value)) return 0;
  if (hi === lo) return 0;
  return clamp(1 - (value - lo) / (hi - lo), 0, 1);
}

// ── Score helpers (each returns 0..25 per the spec) ───────────────────────
export const to25 = (unit: number): number => unit * 25;

/** Weighted sum where weights are fractions that should total 1. */
export function weightedSum(parts: Array<{ score: number; weight: number }>): number {
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return 0;
  return parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight;
}

// ── Health label (shared across all derived scores) ───────────────────────
export type HealthTone = "positive" | "neutral" | "warning" | "negative";

export function healthLabel(score: number): string {
  if (score >= 75) return "Sehat";
  if (score >= 60) return "Stabil";
  if (score >= 45) return "Waspada";
  return "Rentan";
}

export function toneForScore(score: number): HealthTone {
  if (score >= 75) return "positive";
  if (score >= 60) return "neutral";
  if (score >= 45) return "warning";
  return "negative";
}

// ── IDR formatting ────────────────────────────────────────────────────────
/**
 * Indonesian-scale number formatting.
 * IDX market cap is ~1.1e16 IDR, which is why we need Ribuan T (10^15).
 *   >= 1e15 → "Rp 11,23 Ribu T"
 *   >= 1e12 → "Rp 9.876,54 T"
 *   >= 1e9  → "Rp 654,32 M"
 * Uses id-ID grouping: thousands separator ".", decimal ",".
 */
export function formatIDRScale(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const id = (n: number, d: number) =>
    n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

  if (abs >= 1e15) return `${sign}Rp ${id(abs / 1e15, 2)} Ribu T`;
  if (abs >= 1e12) return `${sign}Rp ${id(abs / 1e12, 2)} T`;
  if (abs >= 1e9) return `${sign}Rp ${id(abs / 1e9, 2)} M`;
  if (abs >= 1e6) return `${sign}Rp ${id(abs / 1e6, 2)} Jt`;
  return `${sign}Rp ${id(abs, 0)}`;
}
