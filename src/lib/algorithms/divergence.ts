/**
 * divergence.ts — Sector Divergence Anomaly Detection (Algoritma 5)
 * ==========================================================================
 * RPAD — Robust Peer-Relative Anomaly Detection (IJEEI manuscript §2.6).
 *
 * Replaces the deployed classical mean/SD z-score on raw P/E, which had a
 * proven structural blindness: with positive-only P/E the most negative
 * attainable z-score in an IDX peer group is ≈ −0.14…−0.58 (one near-zero-
 * earnings firm inflates the SD), so the value-trap and value-dislocation
 * rules could NEVER fire, and every flag was a near-zero-earnings artefact.
 *
 * RPAD changes exactly three things and keeps the rule matrix (Table 2):
 *   1. Valuation enters as earnings yield EY = 1/PE (bounded near zero
 *      earnings) — cheap = HIGH EY, so the valuation conditions flip sign.
 *   2. Location/scale are median and 1.4826·MAD (scaled-MAD ×1.2533
 *      fallback when MAD = 0) instead of mean and SD.
 *   3. A two-sided data-quality gate: EY < 1% (P/E > 100) or EY > 100%
 *      (P/E < 1) → "ratio unreliable". Such firms stay in the peer
 *      statistics and can fire the margin rule, but can never receive a
 *      valuation flag — the UI shows a data-quality notice instead.
 *
 * Threshold t = 1.8 and the rule precedence are unchanged from the
 * published specification; the min valuation peer group is 5 firms.
 *
 * DATA NOTE (decided with the user): the screener route is used because it
 * exposes `der_mrq`, `free_float` and TTM snapshots the subsector "companies"
 * section does not. Cost: 1 credit per structured query (never ?q=, which
 * costs 3). Screener fields used here are all confirmed present in the docs:
 *   symbol, company_name, sub_sector, pe_ttm, roe_ttm, der_mrq,
 *   net_profit_margin[YYYY], pb_mrq, yield_ttm
 */

import { SHI_WEIGHTS } from "./shi";

/**
 * One screener row AFTER unwrapping `query_values`.
 *
 * CONFIRMED LIVE against /v2/companies/ (this cost real credits to establish,
 * so the findings are recorded here rather than rediscovered):
 *
 *  1. The screener returns ONLY {symbol, company_name} unless you pass
 *     `include_query_values=true`. With that flag each row gains a
 *     `query_values` object holding the fields named in the `where` clause.
 *     Without it you get no metrics at all — every Z-score would be null.
 *
 *  2. Key names inside query_values echo the where-clause EXACTLY, including
 *     bracket notation: `net_profit_margin[2024]` is literally keyed
 *     "net_profit_margin[2024]", not "net_margin".
 *
 *  3. `der_mrq` is populated for non-financials (basic-materials 91,
 *     retailing 26, oil-gas-coal 72...) but is entirely ABSENT for banks
 *     (0 rows). Debt-to-equity is not meaningful for banks, so the
 *     "Value Trap Alert" rule is structurally unavailable for that subsector.
 *     We surface this instead of faking it.
 *
 *  4. The screener must be called per sub_sector (sub_sector is NOT a
 *     supported top-level query param — it belongs in `where`), so each
 *     anomaly scan costs 1 credit per subsector, never the 3-credit `?q=` NLQ.
 */
export interface ScreenerRow {
  symbol: string;
  company_name: string;
  sub_sector?: string | null;
  sector?: string | null;
  pe_ttm?: number | null;
  pb_mrq?: number | null;
  roe_ttm?: number | null;
  roa_ttm?: number | null;
  der_mrq?: number | null;
  net_margin?: number | null;
  yield_ttm?: number | null;
  payout_ratio?: number | null;
  market_cap?: number | null;
  free_float?: number | null;
  /** Live price from screener query_values (same query, 0 extra credits). */
  last_close_price?: number | null;
  /** Daily change as decimal (0.0124 = +1.24%). */
  daily_close_change?: number | null;
}

/**
 * Raw screener result row as returned by the API.
 * Metrics live under `query_values`; keys mirror the where-clause verbatim,
 * e.g. "pe_ttm", "net_profit_margin[2024]".
 */
export interface ScreenerApiRow {
  symbol: string;
  company_name: string;
  query_values?: Record<string, unknown>;
}

/** Pulls a numeric value from query_values, tolerating bracketed key names. */
function pickMetric(
  qv: Record<string, unknown> | undefined,
  ...candidates: string[]
): number | null {
  if (!qv) return null;
  for (const key of candidates) {
    if (key in qv) {
      const v = qv[key];
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  // Bracket-notation fallback: net_margin -> any "net_profit_margin[YYYY]"
  for (const [k, v] of Object.entries(qv)) {
    if (candidates.some((c) => k.startsWith(c))) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Strips the ".JK" suffix the screener includes on every symbol. */
export function cleanSymbol(symbol: string): string {
  return String(symbol ?? "")
    .replace(/\.JK$/i, "")
    .toUpperCase();
}

/**
 * Converts a raw API row into a ScreenerRow.
 * `marginYear` lets callers target a specific fiscal year; it falls back to
 * any available year when the requested one is missing.
 */
export function normalizeScreenerRow(row: ScreenerApiRow, marginYear?: number): ScreenerRow {
  const qv = row.query_values;
  const margin =
    pickMetric(qv, ...(marginYear != null ? [`net_profit_margin[${marginYear}]`] : [])) ??
    pickMetric(qv, "net_profit_margin");

  return {
    symbol: cleanSymbol(row.symbol),
    company_name: row.company_name ?? "",
    sub_sector: (qv?.["sub_sector"] as string) ?? null,
    pe_ttm: pickMetric(qv, "pe_ttm"),
    pb_mrq: pickMetric(qv, "pb_mrq"),
    roe_ttm: pickMetric(qv, "roe_ttm"),
    roa_ttm: pickMetric(qv, "roa_ttm"),
    der_mrq: pickMetric(qv, "der_mrq"),
    net_margin: margin,
    yield_ttm: pickMetric(qv, "yield_ttm"),
    payout_ratio: pickMetric(qv, "payout_ratio"),
    market_cap: pickMetric(qv, "market_cap"),
    free_float: pickMetric(qv, "free_float"),
    last_close_price: pickMetric(qv, "last_close_price"),
    daily_close_change: pickMetric(qv, "daily_close_change"),
  };
}

// ── Statistics helpers ────────────────────────────────────────────────────
export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1). Returns 0 when degenerate. */
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Median — the robust location estimator used by RPAD. */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/**
 * Normal-consistent robust scale: 1.4826 × MAD (median absolute deviation).
 * Falls back to 1.2533 × mean absolute deviation when the MAD is 0
 * (e.g. more than half the sample shares one value) — the classic RPAD
 * fallback so a degenerate group degrades instead of silently returning
 * no signal. Returns null only when even the fallback is 0.
 */
export function robustScale(xs: number[]): number | null {
  const clean = xs.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const med = median(clean);
  const absDev = clean.map((v) => Math.abs(v - med));
  const mad = median(absDev);
  if (mad > 0) return 1.4826 * mad;
  const meanAbsDev = absDev.reduce((a, b) => a + b, 0) / absDev.length;
  if (meanAbsDev > 0) return 1.2533 * meanAbsDev;
  return null;
}

/**
 * Classical (mean/SD) z-score. Retained for backward compatibility and as
 * the reference detector in tests — RPAD itself uses robustZ below.
 */
export function zScore(value: number | null | undefined, sample: number[]): number | null {
  const clean = sample.filter((v) => Number.isFinite(v));
  if (clean.length < 3 || value == null || !Number.isFinite(value)) return null;
  const s = std(clean);
  if (s === 0) return null; // every peer identical → no dispersion to measure
  return (value - mean(clean)) / s;
}

/**
 * RPAD robust z-score: (x − median) / (1.4826·MAD).
 * Returns null when undefined — peer group too small, dispersion degenerate,
 * or the value missing. Callers must treat null as "no signal", never as 0.
 */
export function robustZ(value: number | null | undefined, sample: number[]): number | null {
  const clean = sample.filter((v) => Number.isFinite(v));
  if (clean.length < 3 || value == null || !Number.isFinite(value)) return null;
  const scale = robustScale(clean);
  if (scale == null || scale === 0) return null;
  return (value - median(clean)) / scale;
}

// ── Earnings yield & data-quality gate (RPAD core) ───────────────────────
/**
 * Earnings yield EY = 1/PE. Monotone in P/E but BOUNDED near zero earnings —
 * this is what breaks the equation-8 bound that made cheap firms unflaggable
 * under classical z on raw P/E (see IJEEI manuscript §2.6).
 * Returns null for non-positive or missing P/E.
 */
export function earningsYield(peTtm: number | null | undefined): number | null {
  if (peTtm == null || !Number.isFinite(peTtm) || peTtm <= 0) return null;
  return 1 / peTtm;
}

/**
 * Two-sided data-quality gate. Firms with EY < 1% (P/E > 100 — near-zero
 * earnings) or EY > 100% (P/E < 1 — earnings above market value, almost
 * always a one-off gain) are marked "ratio unreliable": they REMAIN in the
 * peer statistics and can still fire the margin rule, but can never receive
 * a valuation flag. The interface shows a data-quality notice instead.
 */
export const EY_MIN = 0.01; // 1%
export const EY_MAX = 1.0; // 100%

export function isRatioUnreliable(peTtm: number | null | undefined): boolean {
  const ey = earningsYield(peTtm);
  if (ey == null) return false; // missing P/E is "no valuation signal", not an artefact
  return ey < EY_MIN || ey > EY_MAX;
}

// ── Anomaly classification ────────────────────────────────────────────────
export type AnomalyType =
  "value_dislocation" | "overvalued_weak" | "margin_deterioration" | "value_trap" | "none";

export interface AnomalyResult {
  symbol: string;
  company_name: string;
  sub_sector: string;
  type: AnomalyType;
  label: string;
  explanation: string;
  severity: "High" | "Medium";
  z: {
    pe: number | null;
    roe: number | null;
    margin: number | null;
    der: number | null;
  };
  metric: string;
  value: string;
  average: string;
  deviation: number;
  /**
   * True when the flagged firm ALSO fails the data-quality gate (its own
   * P/E is unreliable). Only margin-deterioration flags can carry this —
   * valuation flags are unreachable for DQ firms by construction.
   */
  dataQualityNotice?: boolean;
}

/** A firm the data-quality gate excluded from valuation scoring. */
export interface DqNotice {
  symbol: string;
  company_name: string;
  sub_sector: string;
  pe_ttm: number | null;
  reason: "near_zero_earnings" | "earnings_above_market_cap";
  explanation: string;
}

const FLAG_THRESHOLD = 1.8;
/** Valuation rules need a sturdier peer sample than the margin rule. */
const MIN_VALUATION_PEERS = 5;

/**
 * Evaluates one company against its peer group (RPAD).
 * Pass peers WITHOUT the subject excluded — the reference statistics are
 * computed over the whole group, matching the published evaluation.
 */
export function detectAnomaly(row: ScreenerRow, peers: ScreenerRow[]): AnomalyResult | null {
  // Valuation signal: robust z on EARNINGS YIELD (sign reversed vs P/E —
  // cheap = high EY = positive z). This is the change that makes cheap
  // firms reachable: EY is bounded near zero earnings, so one GOTO cannot
  // stretch the scale past −1.8 the way raw P/E dispersion did.
  const eySamples = peers.map((p) => earningsYield(p.pe_ttm) ?? NaN);
  const zEy = robustZ(earningsYield(row.pe_ttm), eySamples);
  const zRoe = robustZ(
    row.roe_ttm,
    peers.map((p) => p.roe_ttm ?? NaN),
  );
  const zMargin = robustZ(
    row.net_margin,
    peers.map((p) => p.net_margin ?? NaN),
  );
  const zDer = robustZ(
    row.der_mrq,
    peers.map((p) => p.der_mrq ?? NaN),
  );

  // Data-quality gate for the SUBJECT: unreliable-ratio firms remain in the
  // peer statistics above and can still fire the margin rule, but the two
  // cheap-valuation rules and the overvaluation rule are gated off — the
  // caller surfaces a DQ notice for them instead of a valuation flag.
  const dq = isRatioUnreliable(row.pe_ttm);
  const zPeForDisplay = zEy; // kept under the legacy "pe" key for the UI

  const z = { pe: zPeForDisplay, roe: zRoe, margin: zMargin, der: zDer };

  let type: AnomalyType = "none";
  let label = "";
  let explanation = "";
  let severity: "High" | "Medium" = "Medium";
  let metric = "PE";
  let valueNum = row.pe_ttm ?? null;

  // Value Trap takes precedence: it's the most actionable warning.
  // Cheap on EY (z > +t) AND leverage far above peers — and the firm's own
  // P/E must be reliable for a valuation flag to be admissible at all.
  if (
    !dq &&
    row.der_mrq != null &&
    peers.length >= MIN_VALUATION_PEERS &&
    zEy != null &&
    zEy > FLAG_THRESHOLD &&
    zDer != null &&
    zDer > FLAG_THRESHOLD
  ) {
    type = "value_trap";
    label = "Value Trap Alert";
    explanation =
      "Valuasi tampak murah tetapi struktur utang jauh di atas rata-rata peer. Risiko leverage mengalahkan diskon valuasi.";
    severity = "High";
    metric = "DER";
    valueNum = row.der_mrq ?? null;
  } else if (
    !dq &&
    peers.length >= MIN_VALUATION_PEERS &&
    zEy != null &&
    zEy < -FLAG_THRESHOLD &&
    zRoe != null &&
    zRoe < 0
  ) {
    type = "overvalued_weak";
    label = "Overvalued & Weak";
    explanation =
      "Diperdagangkan jauh di atas rata-rata peer sementara profitabilitas (ROE) di bawah rata-rata.";
    severity = "High";
    metric = "PE";
    valueNum = row.pe_ttm ?? null;
  } else if (zMargin != null && zMargin < -FLAG_THRESHOLD) {
    type = "margin_deterioration";
    label = "Margin Deterioration";
    explanation =
      "Margin laba bersih tertinggal jauh dari peer — tekanan biaya atau daya pricing melemah.";
    metric = "Net Margin";
    valueNum = row.net_margin ?? null;
  } else if (
    !dq &&
    peers.length >= MIN_VALUATION_PEERS &&
    zEy != null &&
    zEy > FLAG_THRESHOLD &&
    zRoe != null &&
    zRoe > 0
  ) {
    type = "value_dislocation";
    label = "Value Dislocation";
    explanation =
      "Fundamental solid (ROE di atas rata-rata) namun valuasi di bawah peer — potensi mispricing.";
    metric = "PE";
    valueNum = row.pe_ttm ?? null;
  }

  if (type === "none") return null;

  const peersForMetric =
    metric === "PE"
      ? peers.map((p) => p.pe_ttm)
      : metric === "Net Margin"
        ? peers.map((p) => p.net_margin)
        : peers.map((p) => p.der_mrq);
  const peerMedian = median(
    peersForMetric.filter((v): v is number => v != null && Number.isFinite(v)),
  );

  const pct = (v: number | null) =>
    v == null
      ? "—"
      : metric === "PE" || metric === "DER"
        ? v.toFixed(2) + "x"
        : (v * 100).toFixed(1) + "%";

  return {
    symbol: row.symbol,
    company_name: row.company_name,
    sub_sector: row.sub_sector ?? row.sector ?? "—",
    type,
    label,
    explanation,
    severity,
    z,
    metric,
    value: pct(valueNum),
    average: pct(Number.isFinite(peerMedian) ? peerMedian : null),
    dataQualityNotice: dq,
    // Deviation semantics depend on the metric:
    //  - PE / DER are in absolute "turns" → raw difference from the peer
    //    MEDIAN (robust location, not the outlier-inflated mean).
    //  - Net margin is a decimal (0.05 = 5%) → ×100 for percentage points.
    deviation:
      Math.round(
        (metric === "PE" || metric === "DER"
          ? (valueNum ?? 0) - (Number.isFinite(peerMedian) ? peerMedian : 0)
          : ((valueNum ?? 0) - (Number.isFinite(peerMedian) ? peerMedian : 0)) * 100) * 100,
      ) / 100,
  };
}

/**
 * Data-quality notices: every firm whose P/E fails the two-sided gate.
 * These render as "ratio unreliable" rows in the UI — information, not flags.
 */
export function detectDqNotices(rows: ScreenerRow[]): DqNotice[] {
  const out: DqNotice[] = [];
  for (const row of rows) {
    if (!isRatioUnreliable(row.pe_ttm)) continue;
    const ey = earningsYield(row.pe_ttm)!;
    const nearZero = ey < EY_MIN;
    out.push({
      symbol: row.symbol,
      company_name: row.company_name,
      sub_sector: row.sub_sector ?? row.sector ?? "—",
      pe_ttm: row.pe_ttm ?? null,
      reason: nearZero ? "near_zero_earnings" : "earnings_above_market_cap",
      explanation: nearZero
        ? `P/E ${row.pe_ttm!.toFixed(0)}x — laba mendekati nol, rasio valuasi tidak reliabel. Dikeluarkan dari penilaian anomali valuasi.`
        : `P/E ${row.pe_ttm!.toFixed(2)}x — laba melebihi kapitalisasi pasar (kemungkinan one-off gain), rasio tidak reliabel.`,
    });
  }
  // Most extreme artefacts first (lowest earnings yield).
  return out.sort((a, b) => (a.pe_ttm ?? Infinity) - (b.pe_ttm ?? Infinity)).reverse();
}

/**
 * Runs RPAD across every company in a peer group.
 * Groups are per sub_sector — comparing a bank to a retailer produces
 * meaningless scores, which is exactly the trap this avoids.
 *
 * Returns both real flags and data-quality notices. The `useAnomalies`
 * query data shape gains `dqNotices`; every consumer that previously read
 * `anomalies` keeps working unchanged.
 */
export interface DetectionOutput {
  anomalies: AnomalyResult[];
  dqNotices: DqNotice[];
}

export function detectAnomalies(rows: ScreenerRow[]): AnomalyResult[] {
  return detectAnomaliesWithDq(rows).anomalies;
}

export function detectAnomaliesWithDq(rows: ScreenerRow[]): DetectionOutput {
  const bySector = new Map<string, ScreenerRow[]>();
  for (const r of rows) {
    const key = r.sub_sector ?? r.sector ?? "unknown";
    const list = bySector.get(key) ?? [];
    list.push(r);
    bySector.set(key, list);
  }

  const out: AnomalyResult[] = [];
  for (const [, peers] of bySector) {
    if (peers.length < 3) continue; // robust scale needs a real sample
    for (const row of peers) {
      const res = detectAnomaly(row, peers);
      if (res) out.push(res);
    }
  }

  // High severity first, then biggest absolute deviation
  const anomalies = out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "High" ? -1 : 1;
    return Math.abs(b.deviation) - Math.abs(a.deviation);
  });

  return { anomalies, dqNotices: detectDqNotices(rows) };
}

// Re-export so consumers can document the SHI weights alongside anomalies
export const ANOMALY_SHARED_WEIGHTS = SHI_WEIGHTS;
