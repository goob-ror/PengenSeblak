/**
 * terminal-metrics.ts — Bagian 2 metrics + Gap 2 + Dominance (Algoritma 4)
 * ==========================================================================
 * Features To Be Implemented.md:
 *   A. Free Float & Liquidity Risk     → Terminal Emiten & Screener
 *   B. Analyst Expectation Gap         → Terminal Emiten
 *   C. ESG Momentum Tier               → Screener + Terminal
 *   E. Revenue Concentration HHI       → Terminal Emiten
 *   Gap 2. Valuation Percentile Rank (5Y)
 *   Algoritma 4. Dominance Score (head-to-head 2–5 emiten)
 *
 * INPUT SHAPES — all VERIFIED LIVE 2026-09-24 against the running proxy:
 *
 *  /v2/company/report/{sym}/?sections=overview,valuation,financials,dividend
 *    valuation.historical_valuation → ARRAY of { year, pe, pb, ps, pcf, peg,
 *      pe_peer_avg, pb_peer_avg, ... } — 5 entries (2022..2026) confirmed on
 *      ASII/BBCA. NOTE: this differs from the SUBSECTOR endpoint, which
 *      returns a MAP keyed by year — hence pickYearly() tolerates both.
 *    financials.historical_financials        → ARRAY of yearly rows
 *    financials.historical_financial_ratio   → ARRAY { year, leverage:{...},
 *      liquidity:{current_ratio}, profitability:{roa,roe,...}, efficiency:{...} }
 *    financials.historical_eps               → MAP { "2025": {eps, eps_growth} }
 *    dividend.yield_ttm, dividend.payout_ratio
 *    overview.market_cap, overview.sub_sector
 *
 *  /v2/company/get-segments/{sym}/  → { symbol, financial_year,
 *      revenue_breakdown: [{source, target, value}] }
 *      Segments feeding direct revenue are the rows with target === "Total
 *      Revenue"; everything else (Cost of Revenue, Gross Profit, Operating
 *      Expense, Selling, ...) is a Sankey leaf further down the tree.
 *      Verified on ASII: 3 real segments + 6 non-revenue rows.
 *
 *  /v2/free-float/  → flat ARRAY of { symbol, company_name, free_float }
 *      (decimal 0..1), 961 rows for the whole IDX — ONE call covers every
 *      page. `symbol` keeps the .JK suffix.
 *
 *  Screener /v2/companies/ with include_query_values=true exposes exactly the
 *      fields named in `where`, including forecast_eps_growth[YYYY],
 *      eps_growth[YYYY], forward_pe, esg_score, free_float. All six were
 *      probed live and returned values.
 */

import { clamp } from "./scoring";

// ── A. Free Float & Liquidity Risk ───────────────────────────────────────
export type FloatRiskLevel = "low" | "limited" | "healthy";

export interface FreeFloatRisk {
  freeFloat: number | null;          // decimal 0..1
  level: FloatRiskLevel | null;
  label: string;
  note: string;
  liquidityCliff: boolean;
}

/**
 * Thresholds straight from the spec:
 *   <15% → Low Float, 15–35% → Float Terbatas, >=35% → Float Sehat
 * Trigger: free float < 20% AND volume 30d < sector median → "Liquidity
 * Cliff". Volume is not part of this endpoint, so the caller passes it; when
 * it isn't available the trigger simply cannot fire (we don't guess).
 */
export function classifyFreeFloat(
  freeFloat: number | null,
  volumeBelowMedian: boolean | null,
): FreeFloatRisk {
  const empty: FreeFloatRisk = {
    freeFloat: null,
    level: null,
    label: "Data tidak tersedia",
    note: "Free float tidak dilaporkan untuk emiten ini.",
    liquidityCliff: false,
  };
  if (freeFloat == null || !Number.isFinite(freeFloat)) return empty;

  const level: FloatRiskLevel = freeFloat < 0.15 ? "low" : freeFloat < 0.35 ? "limited" : "healthy";
  const label = level === "low" ? "Low Float" : level === "limited" ? "Float Terbatas" : "Float Sehat";
  const note =
    level === "low"
      ? "Saham beredar publik < 15% — hati-hati potensi manipulasi harga."
      : level === "limited"
        ? "15–35% — volume kecil sudah cukup menggerakkan harga."
        : ">= 35% — likuiditas publik memadai.";

  const liquidityCliff = volumeBelowMedian === true && freeFloat < 0.2;

  return { freeFloat, level, label, note, liquidityCliff };
}

export const floatTone = (level: FloatRiskLevel | null): "negative" | "warning" | "positive" | "neutral" =>
  level === "low" ? "negative" : level === "limited" ? "warning" : level === "healthy" ? "positive" : "neutral";

// ── C. ESG Momentum Tier ─────────────────────────────────────────────────
export type EsgTier = "leader" | "follower" | "laggard";

export function classifyEsg(score: number | null): {
  tier: EsgTier | null;
  label: string;
  note: string;
} {
  if (score == null || !Number.isFinite(score)) {
    return { tier: null, label: "Tidak tersedia", note: "Skor ESG belum dilaporkan." };
  }
  if (score > 70) return { tier: "leader", label: "ESG Leader", note: "Skor > 70 — praktik ESG terdepan." };
  if (score > 50) return { tier: "follower", label: "ESG Follower", note: "Skor 50–70 — mengikuti standar." };
  return { tier: "laggard", label: "ESG Laggard", note: "Skor <= 50 — tertinggal." };
}

export const esgTone = (tier: EsgTier | null): "positive" | "warning" | "negative" | "neutral" =>
  tier === "leader" ? "positive" : tier === "follower" ? "warning" : tier === "laggard" ? "negative" : "neutral";

// ── Gap 2. Valuation Percentile Rank (5Y) ────────────────────────────────
export interface ValuationPercentile {
  percentile: number | null;   // 0..100
  yearsUsed: number;
  label: string;
  note: string;
}

/**
 * Percentile = (years whose historical PE is BELOW today's PE_TTM) / 5 * 100.
 * >= 80 → mahal (historically only cheap 20% of the time at today level)
 * <= 20 → murah.
 * Uses up to `window` most recent years so a single missing year doesn't
 * silently drop the denominator to 4 and shift the band.
 */
export function valuationPercentile(
  yearlyPe: Array<{ year: string; pe: number | null }>,
  peTtm: number | null,
  window = 5,
): ValuationPercentile {
  const usable = yearlyPe
    .filter((y) => y.pe != null && Number.isFinite(y.pe) && (y.pe as number) > 0)
    .slice(-window);

  if (peTtm == null || !Number.isFinite(peTtm) || peTtm <= 0 || usable.length === 0) {
    return {
      percentile: null,
      yearsUsed: 0,
      label: "Tidak tersedia",
      note: "PE TTM atau riwayat PE tidak tersedia.",
    };
  }

  const cheaper = usable.filter((y) => (y.pe as number) < peTtm).length;
  // Spec divides by 5; scale when fewer years are genuinely available so the
  // band isn't biased downwards.
  const pct = Math.round(clamp((cheaper / usable.length) * 100, 0, 100));

  return {
    percentile: pct,
    yearsUsed: usable.length,
    label: pct >= 80 ? "Valuasi Relatif Mahal" : pct <= 20 ? "Valuasi Relatif Murah" : "Valuasi Wajar",
    note:
      pct >= 80
        ? `${pct}% dari riwayat PE ${usable.length}Y lebih murah dari PE saat ini.`
        : pct <= 20
          ? `Hanya ${pct}% riwayat PE ${usable.length}Y yang lebih murah dari PE saat ini.`
          : `PE saat ini berada di persentil ${pct} dari ${usable.length} tahun terakhir.`,
  };
}

// ── B. Analyst Expectation Gap ───────────────────────────────────────────
export interface AnalystGap {
  actualEpsGrowth: number | null;
  forecastEpsGrowth: number | null;
  gap: number | null;
  label: string;
  note: string;
  forwardPe: number | null;
  peTtm: number | null;
  acceleration: boolean;
}

/**
 * Gap = Actual EPS Growth (2Y avg) − Forecast EPS Growth.
 *   Gap > +10%  → Consistent Beater
 *   Gap < −10%  → Consistent Misser
 * Forward PE < PE_ttm × 0.85 → "Earnings Acceleration Expected".
 * Everything is null-safe: when a leg is missing we report it instead of
 * substituting 0, which would read as "exactly in line".
 */
export function analystExpectationGap(input: {
  actualEpsGrowth: number | null;
  forecastEpsGrowth: number | null;
  forwardPe: number | null;
  peTtm: number | null;
}): AnalystGap {
  const { actualEpsGrowth, forecastEpsGrowth, forwardPe, peTtm } = input;
  const gap =
    actualEpsGrowth != null && forecastEpsGrowth != null
      ? actualEpsGrowth - forecastEpsGrowth
      : null;

  const acceleration =
    forwardPe != null && peTtm != null && peTtm > 0 && forwardPe < peTtm * 0.85;

  let label = "Tidak tersedia";
  let note = "Data EPS historis atau proyeksi analis tidak lengkap.";
  if (gap != null) {
    if (gap > 0.1) {
      label = "Consistent Beater";
      note = `Realisasi pertumbuhan EPS ${(gap * 100).toFixed(1)}pp di atas proyeksi — guidance manajemen konservatif.`;
    } else if (gap < -0.1) {
      label = "Consistent Misser";
      note = `Realisasi ${Math.abs(gap * 100).toFixed(1)}pp di bawah proyeksi — over-promise, under-deliver.`;
    } else {
      label = "Sejalan";
      note = `Selisih ${(gap * 100).toFixed(1)}pp — realisasi mendekati proyeksi analis.`;
    }
  }

  return { actualEpsGrowth, forecastEpsGrowth, gap, label, note, forwardPe, peTtm, acceleration };
}

// ── E. Revenue Concentration (HHI) ───────────────────────────────────────
export interface RevenueConcentration {
  hhi: number | null;
  segments: Array<{ name: string; value: number; share: number }>;
  label: string;
  note: string;
}

/**
 * HHI = Σ (share_i)²  over segments that feed straight into Total Revenue.
 * Rows whose `target` !== "Total Revenue" belong to deeper Sankey levels
 * (Cost of Revenue, Gross Profit, Operating Expense…) and must be excluded —
 * including them double-counts the same revenue. Verified on ASII.
 */
export function revenueConcentration(
  breakdown: Array<{ source?: string; target?: string; value?: number }> | null | undefined,
): RevenueConcentration {
  if (!breakdown || breakdown.length === 0) {
    return { hhi: null, segments: [], label: "Tidak tersedia", note: "Emiten tidak melaporkan segmentasi pendapatan." };
  }

  const direct = breakdown.filter(
    (r) => r.target === "Total Revenue" && typeof r.value === "number" && Number.isFinite(r.value) && r.value > 0,
  );
  if (direct.length === 0) {
    return { hhi: null, segments: [], label: "Tidak tersedia", note: "Tidak ada segmen pendapatan langsung." };
  }

  const total = direct.reduce((s, r) => s + (r.value as number), 0);
  const segments = direct
    .map((r) => {
      const value = r.value as number;
      const share = total > 0 ? value / total : 0;
      return { name: String(r.source ?? "—"), value, share };
    })
    .sort((a, b) => b.share - a.share);

  const hhi = Math.round(segments.reduce((s, x) => s + x.share ** 2, 0) * 1e4) / 1e4;

  return {
    hhi,
    segments,
    label: hhi > 0.5 ? "Konsentrasi Tinggi" : hhi >= 0.25 ? "Diversifikasi Sedang" : "Diversifikasi Baik",
    note:
      hhi > 0.5
        ? `HHI ${hhi.toFixed(2)} — sangat bergantung pada 1 segmen.`
        : hhi >= 0.25
          ? `HHI ${hhi.toFixed(2)} — diversifikasi sedang.`
          : `HHI ${hhi.toFixed(2)} — pendapatan terdiversifikasi.`,
  };
}

// ── Algoritma 4. Dominance Score (head-to-head) ──────────────────────────
export interface DominanceInput {
  symbol: string;
  roe: number | null;
  netMargin: number | null;
  ebitdaMargin: number | null;
  der: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  peVsPeer: number | null;
  pb: number | null;
  yieldTtm: number | null;
  payoutRatio: number | null;
  marketCap: number | null;
}

export interface DominanceResult {
  symbol: string;
  total: number;
  profitability: number;
  safety: number;
  growth: number;
  value: number;
  market: number;
  available: boolean;
  missing: string[];
}

/**
 * Each of the five blocks is 0–20 for a 0–100 total.
 *
 * rank 1 = best within the peer set of size N.
 * `higherIsBetter=false` inverts (DER, PE-vs-peer, PB: lower wins).
 * Missing values get NO rank — the spec's NB/(3N) form assumes every peer has
 * a value; feeding a fake 0 would push the missing peer to the bottom and
 * manufacture a ranking out of absent data. Instead we average the available
 * terms and scale over the N that actually contributed.
 */
export function dominanceScore(rows: DominanceInput[]): DominanceResult[] {
  const N = rows.length;
  if (N === 0) return [];

  const missingPer: Record<string, string[]> = {};

  const rankMap = (key: keyof DominanceInput, higherIsBetter: boolean): Map<string, number> => {
    const valid = rows.filter((r) => {
      const v = r[key];
      return typeof v === "number" && Number.isFinite(v);
    });
    for (const r of rows) {
      const v = r[key];
      if (!(typeof v === "number" && Number.isFinite(v))) {
        (missingPer[r.symbol] ??= []).push(String(key));
      }
    }
    const sorted = [...valid].sort((a, b) => {
      const va = a[key] as number;
      const vb = b[key] as number;
      return higherIsBetter ? vb - va : va - vb;
    });
    const m = new Map<string, number>();
    sorted.forEach((r, i) => m.set(r.symbol, i + 1));
    return m;
  };

  const rRoe = rankMap("roe", true);
  const rMargin = rankMap("netMargin", true);
  const rEbitda = rankMap("ebitdaMargin", true);
  const rDer = rankMap("der", false);          // reversed per spec
  const rCurrent = rankMap("currentRatio", true);
  const rIcr = rankMap("interestCoverage", true);
  const rRevGrowth = rankMap("revenueGrowth", true);
  const rEpsGrowth = rankMap("epsGrowth", true);
  const rPePeer = rankMap("peVsPeer", false);  // cheaper wins
  const rPb = rankMap("pb", false);
  const rMcap = rankMap("marketCap", true);

  // rank_yield_inv: yield too high is a risk signal, so extreme yields are
  // pushed down. Implemented by ranking min(|yield-0.06|) — the sweet spot is
  // ~6%, above 15% it deteriorates again.
  const yieldScoreVal = (r: DominanceInput): number | null => {
    if (r.yieldTtm == null) return null;
    const y = r.yieldTtm;
    if (r.payoutRatio != null && r.payoutRatio > 0.9) return 0; // payout danger
    if (y > 0.15) return -(y - 0.15);        // beyond 15% → worse
    return 1 - Math.abs(y - 0.06);
  };
  const yieldRows = rows
    .map((r) => ({ symbol: r.symbol, v: yieldScoreVal(r) }))
    .filter((x): x is { symbol: string; v: number } => x.v != null && Number.isFinite(x.v))
    .sort((a, b) => b.v - a.v);
  const rYield = new Map<string, number>();
  yieldRows.forEach((x, i) => rYield.set(x.symbol, i + 1));
  for (const r of rows) if (yieldScoreVal(r) == null) (missingPer[r.symbol] ??= []).push("yieldTtm");

  /**
   * Spec form: sum(N - rank_i + 1) / (terms * N) * 20, evaluated for THIS row.
   * Terms whose value is missing for the row are excluded from both numerator
   * and denominator, so a missing metric can't drag the whole block to 0.
   */
  const block = (keys: Map<string, number>[], symbol: string): number => {
    let num = 0;
    let terms = 0;
    for (const k of keys) {
      const rank = k.get(symbol);
      if (rank == null) continue;
      num += N - rank + 1;
      terms += 1;
    }
    return terms === 0 ? 0 : (num / (terms * N)) * 20;
  };

  return rows.map((r) => {
    const profitability = block([rRoe, rMargin, rEbitda], r.symbol);
    const safety = block([rDer, rCurrent, rIcr], r.symbol);
    const growth = block([rRevGrowth, rEpsGrowth], r.symbol);
    const value = block([rPePeer, rPb], r.symbol);
    const market = block([rYield, rMcap], r.symbol);

    const missing = Array.from(new Set(missingPer[r.symbol] ?? []));
    const total = Math.round((profitability + safety + growth + value + market) * 10) / 10;

    return {
      symbol: r.symbol,
      total,
      profitability: round1(profitability),
      safety: round1(safety),
      growth: round1(growth),
      value: round1(value),
      market: round1(market),
      available: missing.length < 11,
      missing,
    };
  });
}

const round1 = (v: number) => Math.round(v * 10) / 10;

// ── Shared formatting ────────────────────────────────────────────────────
export const pct = (v: number | null, digits = 1): string =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
export const ratio = (v: number | null, digits = 2): string =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}x`;
