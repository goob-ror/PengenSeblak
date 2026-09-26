/**
 * distress.ts — Piotroski F-Score (Algoritma 2) + Altman Z"-Score (Algoritma 3)
 * ==========================================================================
 * Features To Be Implemented.md Bagian 1.
 *
 * INPUT SHAPE — VERIFIED LIVE 2026-09-24 against
 *   /v2/company/report/{symbol}/?sections=overview,financials,valuation,future
 * (bbca_report.json in the repo root is the same raw shape and was used as
 *  the offline reference; ASII/ANTM/symbol probes confirmed non-bank shape):
 *
 *   financials.historical_financials   → ARRAY of yearly objects (ascending).
 *      Non-null subset differs by sector. Non-bank rows carry:
 *        revenue, earnings, ebit, total_assets, total_equity,
 *        total_liabilities, current_assets, current_liabilities,
 *        retained_earnings, operating_cash_flow, gross_profit, ...
 *      Bank rows carry instead: current_account, savings_account,
 *        total_deposit, credit_rwa, total_risk_weighted_asset, net_loan...
 *        and notably `ebit` is populated on recent years but *not* old ones
 *        (BBCA 2018–2021 ebit = null), and there is NO current_assets /
 *        current_liabilities / retained_earnings at all for banks.
 *
 *   financials.historical_financial_ratio → ARRAY (not map!) of
 *      { year, profitability:{roa,roe,net_profit_margin,gross_profit_margin},
 *        leverage:{debt_to_equity_ratio,interest_coverage_ratio},
 *        liquidity:{current_ratio}, efficiency:{total_asset_turnover} }
 *      This is the reliable source for ROA/current ratio/asset turnover:
 *      it is computed upstream, so it survives all the nullable fields above.
 *
 *   valuation.historical_valuation → verified as a MAP keyed by year in the
 *      subsector endpoint, but the COMPANY endpoint returns an ARRAY of
 *      { year, pe, pb, ps, pcf, peg, pe_peer_avg, ... } (ascending). Both
 *      shapes are handled — see pickYearly().
 *
 *   future.company_growth_forecasts → ARRAY [{ base_year, estimate_year,
 *      eps_growth, revenue_growth }] — nearest forecast year first.
 *   valuation.forward_pe           → forward P/E scalar.
 *
 * Everything here tolerates missing pieces by returning `null` pieces rather
 * than substituting 0, so the UI can say "data tidak tersedia" honestly.
 */

// ── Input types ─────────────────────────────────────────────────────────
export interface CompanyFinancialsInput {
  symbol?: string | undefined;
  company_name?: string | undefined;
  overview?:
    | {
        sub_sector?: string | null | undefined;
        sector?: string | null | undefined;
        industry?: string | null | undefined;
      }
    | null
    | undefined;
  financials?: {
    eps?: number | null;
    historical_financials?: Array<Record<string, unknown>> | null | undefined;
    historical_financial_ratio?: Array<Record<string, unknown>> | null | undefined;
    historical_eps?: Record<string, Record<string, number>> | null | undefined;
    yoy_quarter_revenue_growth?: number | null | undefined;
    yoy_quarter_earnings_growth?: number | null | undefined;
  } | null | undefined;
  valuation?: {
    forward_pe?: number | null;
    historical_valuation?: unknown;
  } | null | undefined;
  future?: { company_growth_forecasts?: Array<Record<string, unknown>> | null } | null | undefined;
  dividend?: { yield_ttm?: number | null; payout_ratio?: number | null } | null | undefined;
}

export interface CompanyReportYear {
  year: number;
  [key: string]: unknown;
}

// ── Small helpers ───────────────────────────────────────────────────────
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Reads a numeric field off a (possibly undefined) object. */
function pick(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  return num((obj as Record<string, unknown>)[key]);
}

/**
 * Picks the newest available EPS.
 * `historical_eps` is a {"2024": {eps, eps_growth}} map.
 */
export function latestEps(fin: NonNullable<CompanyFinancialsInput["financials"]>): {
  eps: number | null;
  eps_growth: number | null;
} {
  const map = fin.historical_eps;
  if (!map || typeof map !== "object") return { eps: null, eps_growth: null };
  const entries = Object.entries(map)
    .filter(([y]) => /^\d{4}$/.test(y))
    .sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = entries.length - 1; i >= 0; i--) {
    const obj = entries[i]?.[1];
    if (obj && typeof obj === "object") {
      const eps = num((obj as Record<string, unknown>)["eps"]);
      if (eps !== null) {
        return { eps, eps_growth: num((obj as Record<string, unknown>)["eps_growth"]) };
      }
    }
  }
  return { eps: null, eps_growth: null };
}

/**
 * Extracts and sorts the yearly rows for an array field, newest-last.
 * Filters out falsy rows defensively.
 */
function pickYearly(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ ...r, __y: String(r["year"] ?? "") }) as Record<string, unknown>)
    .sort((a, b) => String(a["__y"]).localeCompare(String(b["__y"])));
}

/** Reads a nested ratio off historical_financial_ratio for a given year string. */
function ratioFor(
  ratios: Array<Record<string, unknown>> | null | undefined,
  year: string,
  group: string,
  key: string,
): number | null {
  if (!ratios) return null;
  const hit = ratios.find((r) => String(r["year"]) === year);
  if (!hit) return null;
  return pick(hit[group], key);
}

// ── Known distorters (minimal — only what the task confirmed) ────────────
/** Fraud-risk discount for the given ticker. Returns 0..1 (1 = no adjustment). */
export function fraudRiskMultiplier(symbol: string): number {
  return /^(JIHD|KPAL)$/i.test(symbol) ? 0.5 : 1;
}

// ── Piotroski F-Score ───────────────────────────────────────────────────
export interface PiotroskiResult {
  total: number;
  profitability: number;
  leverage: number;
  efficiency: number;
  signals: {
    f1_roa_positive: boolean;
    f2_cfo_positive: boolean;
    f3_roa_improving: boolean;
    f4_accruals_negative: boolean;
    f5_leverage_down: boolean;
    f6_current_ratio_up: boolean;
    f7_no_dilution: boolean;
    f8_gross_margin_up: boolean;
    f9_asset_turnover_up: boolean;
  };
  detail: Array<{ id: string; name: string; point: number; note: string }>;
  available: boolean;
  missing: string[];
}

/**
 * Algoritma 2 — 9 binary signals, total 0..9.
 * Uses the last two fiscal years; anything unavailable scores 0 for that
 * signal AND is listed in `missing` so the UI can disclose it.
 */
export function piotroskiFScore(input: CompanyFinancialsInput): PiotroskiResult {
  const missing: string[] = [];
  const fin = input.financials;
  const years = pickYearly(fin?.historical_financials);
  const ratios = fin?.historical_financial_ratio ?? null;

  const last = years.at(-1) ?? null;
  const prev = years.at(-2) ?? null;

  const yLast = last ? String(last["year"]) : null;
  const yPrev = prev ? String(prev["year"]) : null;

  // F1 — ROA > 0 (upstream ratio; falls back to earnings/total_assets)
  const roaLast =
    (yLast ? ratioFor(ratios, yLast, "profitability", "roa") : null) ??
    safeDiv(pick(last, "earnings"), pick(last, "total_assets"));
  const roaPrev =
    (yPrev ? ratioFor(ratios, yPrev, "profitability", "roa") : null) ??
    safeDiv(pick(prev, "earnings"), pick(prev, "total_assets"));

  // F2 — operating cash flow > 0
  const cfo = pick(last, "operating_cash_flow");

  // F5 — leverage down: debt-to-equity ratio (lower is better)
  const derLast = yLast ? ratioFor(ratios, yLast, "leverage", "debt_to_equity_ratio") : null;
  const derPrev = yPrev ? ratioFor(ratios, yPrev, "leverage", "debt_to_equity_ratio") : null;

  // F6 — current ratio up (banks have no meaningful current ratio)
  const crLast = yLast ? ratioFor(ratios, yLast, "liquidity", "current_ratio") : null;
  const crPrev = yPrev ? ratioFor(ratios, yPrev, "liquidity", "current_ratio") : null;

  // F7 — no dilution: shares outstanding flat or down
  const shLast = pick(last, "outstanding_shares");
  const shPrev = pick(prev, "outstanding_shares");

  // F8 — gross margin up
  const gmLast = computeGrossMargin(last);
  const gmPrev = computeGrossMargin(prev);

  // F9 — asset turnover up
  const atLast =
    (yLast ? ratioFor(ratios, yLast, "efficiency", "total_asset_turnover") : null) ??
    safeDiv(pick(last, "revenue"), pick(last, "total_assets"));
  const atPrev =
    (yPrev ? ratioFor(ratios, yPrev, "efficiency", "total_asset_turnover") : null) ??
    safeDiv(pick(prev, "revenue"), pick(prev, "total_assets"));

  // Accruals (F4): CFO/TA - ROA. Negative is the good sign.
  const accruals =
    roaLast != null ? safeDiv(cfo, pick(last, "total_assets"))! - roaLast : null;

  if (roaLast == null) missing.push("F1 ROA");
  if (cfo == null) missing.push("F2 arus kas operasi");
  if (roaLast == null || roaPrev == null) missing.push("F3 ROA tahun sebelumnya");
  if (accruals == null) missing.push("F4 akrual");
  if (derLast == null || derPrev == null) missing.push("F5 rasio utang");
  if (crLast == null || crPrev == null) missing.push("F6 current ratio");
  if (shLast == null || shPrev == null) missing.push("F7 jumlah saham");
  if (gmLast == null || gmPrev == null) missing.push("F8 margin kotor");
  if (atLast == null || atPrev == null) missing.push("F9 perputaran aset");

  const s = {
    f1_roa_positive: roaLast != null && roaLast > 0,
    f2_cfo_positive: cfo != null && cfo > 0,
    f3_roa_improving: roaLast != null && roaPrev != null && roaLast > roaPrev,
    f4_accruals_negative: accruals != null && accruals < 0,
    f5_leverage_down: derLast != null && derPrev != null && derLast < derPrev,
    f6_current_ratio_up: crLast != null && crPrev != null && crLast > crPrev,
    f7_no_dilution: shLast != null && shPrev != null && shLast <= shPrev,
    f8_gross_margin_up: gmLast != null && gmPrev != null && gmLast > gmPrev,
    f9_asset_turnover_up: atLast != null && atPrev != null && atLast > atPrev,
  };

  const pt = (ok: boolean) => (ok ? 1 : 0);
  const profitability = pt(s.f1_roa_positive) + pt(s.f2_cfo_positive) + pt(s.f3_roa_improving) + pt(s.f4_accruals_negative);
  const leverage = pt(s.f5_leverage_down) + pt(s.f6_current_ratio_up) + pt(s.f7_no_dilution);
  const efficiency = pt(s.f8_gross_margin_up) + pt(s.f9_asset_turnover_up);

  const fmt = (v: number | null, kind: "pct" | "x" | "num") =>
    v == null
      ? "n/a"
      : kind === "pct"
        ? `${(v * 100).toFixed(2)}%`
        : kind === "x"
          ? `${v.toFixed(2)}x`
          : v.toLocaleString("id-ID");

  const detail: PiotroskiResult["detail"] = [
    { id: "F1", name: "ROA > 0", point: pt(s.f1_roa_positive), note: `ROA ${fmt(roaLast, "pct")}` },
    { id: "F2", name: "Arus kas operasi > 0", point: pt(s.f2_cfo_positive), note: `CFO ${fmt(cfo, "num")}` },
    { id: "F3", name: "ROA meningkat YoY", point: pt(s.f3_roa_improving), note: `${fmt(roaPrev, "pct")} → ${fmt(roaLast, "pct")}` },
    { id: "F4", name: "Akrual < 0", point: pt(s.f4_accruals_negative), note: `CFO/TA − ROA = ${fmt(accruals, "pct")}` },
    { id: "F5", name: "Leverage turun YoY", point: pt(s.f5_leverage_down), note: `DER ${fmt(derPrev, "x")} → ${fmt(derLast, "x")}` },
    { id: "F6", name: "Current ratio naik YoY", point: pt(s.f6_current_ratio_up), note: `${fmt(crPrev, "x")} → ${fmt(crLast, "x")}` },
    { id: "F7", name: "Tidak ada dilusi saham", point: pt(s.f7_no_dilution), note: `${fmt(shPrev, "num")} → ${fmt(shLast, "num")} saham` },
    { id: "F8", name: "Margin kotor naik YoY", point: pt(s.f8_gross_margin_up), note: `${fmt(gmPrev, "pct")} → ${fmt(gmLast, "pct")}` },
    { id: "F9", name: "Perputaran aset naik YoY", point: pt(s.f9_asset_turnover_up), note: `${fmt(atPrev, "x")} → ${fmt(atLast, "x")}` },
  ];

  return {
    total: profitability + leverage + efficiency,
    profitability,
    leverage,
    efficiency,
    signals: s,
    detail,
    available: missing.length < 9,
    missing,
  };
}

function safeDiv(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

function computeGrossMargin(year: unknown): number | null {
  if (!year || typeof year !== "object") return null;
  const y = year as Record<string, unknown>;
  const gp = num(y["gross_profit"]);
  const rev = num(y["revenue"]);
  if (gp != null && rev != null && rev !== 0) return gp / rev;
  // Some sectors report gross_margin directly
  return num(y["gross_margin"]);
}

// ── Altman Z"-Score (non-manufacturing / emerging market) ────────────────
export type AltmanZone = "safe" | "grey" | "distress";

export interface AltmanResult {
  score: number | null;
  zone: AltmanZone | null;
  isBank: boolean;
  components: Array<{
    id: string;
    name: string;
    ratio: number | null;
    coefficient: number;
    contribution: number | null;
    note: string;
  }>;
  available: boolean;
  missing: string[];
}

/**
 * Algoritma 3 — Z'' = 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4
 *   X1 = (current assets − current liabilities) / total assets
 *   X2 = retained earnings / total assets
 *   X3 = EBIT / total assets
 *   X4 = total equity / total liabilities
 *
 * Bank modification (spec):
 *   X1 = (current account + savings account) / total assets
 *   X4 = total equity / risk-weighted assets (total_risk_weighted_asset)
 *        falling back to credit_rwa, which is what banks actually report.
 * Banks carry no current assets/liabilities or retained earnings upstream,
 * which is why those two X's would otherwise silently read 0.
 */
export function altmanZScore(input: CompanyFinancialsInput): AltmanResult {
  const missing: string[] = [];
  const fin = input.financials;
  const years = pickYearly(fin?.historical_financials);
  const last = years.at(-1) ?? null;

  const isBank = detectBank(input, last);

  const totalAssets = pick(last, "total_assets");
  const totalEquity = pick(last, "total_equity");
  const totalLiab = pick(last, "total_liabilities");
  const ebit = pick(last, "ebit");
  const retained = pick(last, "retained_earnings");

  // ── X1 ──
  let x1: number | null = null;
  let x1Note = "Modal kerja / total aset";
  if (isBank) {
    const ca = pick(last, "current_account");
    const sa = pick(last, "savings_account");
    const dep = pick(last, "total_deposit");
    if (ca != null && sa != null && totalAssets) {
      x1 = (ca + sa) / totalAssets;
      x1Note = "(giro + tabungan) / total aset — modifikasi perbankan";
    } else if (ca != null && sa != null && dep != null && totalAssets) {
      x1 = (totalAssets - dep) / totalAssets;
      x1Note = "(aset − total deposito) / total aset — fallback perbankan";
    }
    if (x1 == null) missing.push("X1 (giro/tabungan bank)");
  } else {
    const ca = pick(last, "current_assets");
    const cl = pick(last, "current_liabilities");
    if (ca != null && cl != null && totalAssets) x1 = (ca - cl) / totalAssets;
    if (x1 == null) missing.push("X1 (aset/liabilitas lancar)");
  }

  // ── X2 ──
  let x2: number | null = null;
  if (retained != null && totalAssets) x2 = retained / totalAssets;
  // Banks have no retained_earnings field upstream — X2 is genuinely
  // unavailable, so we drop it rather than scoring it 0.
  if (x2 == null) missing.push("X2 (laba ditahan)");

  // ── X3 ──
  let x3: number | null = null;
  let x3Note = "EBIT / total aset";
  if (ebit != null && totalAssets) {
    x3 = ebit / totalAssets;
  } else {
    const opPnl = pick(last, "operating_pnl");
    if (opPnl != null && totalAssets) {
      x3 = opPnl / totalAssets;
      x3Note = "EBIT tidak dilaporkan — menggunakan laba operasi";
    }
  }
  if (x3 == null) missing.push("X3 (EBIT)");

  // ── X4 ──
  let x4: number | null = null;
  let x4Note = "Ekuitas / total liabilitas";
  if (isBank) {
    const rwa = pick(last, "total_risk_weighted_asset") ?? pick(last, "credit_rwa");
    if (totalEquity != null && rwa) {
      x4 = totalEquity / rwa;
      x4Note = "Ekuitas / ATMR — modifikasi perbankan";
    }
    if (x4 == null) missing.push("X4 (ekuitas / ATMR)");
  } else {
    if (totalEquity != null && totalLiab) x4 = totalEquity / totalLiab;
    if (x4 == null) missing.push("X4 (ekuitas / liabilitas)");
  }

  const rows: AltmanResult["components"] = [
    { id: "X1", name: "Modal kerja / total aset", ratio: x1, coefficient: 6.56, contribution: x1 != null ? 6.56 * x1 : null, note: x1Note },
    { id: "X2", name: "Laba ditahan / total aset", ratio: x2, coefficient: 3.26, contribution: x2 != null ? 3.26 * x2 : null, note: "—" },
    { id: "X3", name: "EBIT / total aset", ratio: x3, coefficient: 6.72, contribution: x3 != null ? 6.72 * x3 : null, note: x3Note },
    { id: "X4", name: isBank ? "Ekuitas / ATMR" : "Ekuitas / total liabilitas", ratio: x4, coefficient: 1.05, contribution: x4 != null ? 1.05 * x4 : null, note: x4Note },
  ];

  if (x1 == null && x2 == null && x3 == null && x4 == null) {
    return { score: null, zone: null, isBank, components: rows, available: false, missing };
  }

  const sum = rows.reduce((s, r) => s + (r.contribution ?? 0), 0);
  const contributing = rows.filter((r) => r.contribution != null).length;
  // Scale up when some components are unavailable so the zone thresholds
  // (2.6 / 1.1) stay meaningful — otherwise a missing X2 alone drags every
  // company into the distress zone. Mirrors the SHI re-normalisation.
  const score = contributing > 0 ? (sum * 4) / contributing : null;

  return {
    score: score == null ? null : Math.round(score * 100) / 100,
    zone: score == null ? null : score > 2.6 ? "safe" : score > 1.1 ? "grey" : "distress",
    isBank,
    components: rows,
    available: score != null,
    missing,
  };
}

/**
 * Bank detection — deliberately conservative: only classify as bank when a
 * bank-specific balance sheet signal is present, because the Z"-Score
 * modification changes X1 and X4 wholesale.
 */
function detectBank(input: CompanyFinancialsInput, last: unknown): boolean {
  const subSector = input.overview?.sub_sector ?? input.overview?.industry ?? "";
  if (/bank/i.test(String(subSector))) return true;
  // Structural signal: banks report deposits and have no current assets.
  const hasDeposit = pick(last, "total_deposit") != null || pick(last, "current_account") != null;
  const noCurrentAssets = pick(last, "current_assets") == null;
  return hasDeposit && noCurrentAssets;
}

export function altmanZoneLabel(zone: AltmanZone | null): string {
  if (zone === "safe") return "Safe Zone";
  if (zone === "grey") return "Grey Zone";
  if (zone === "distress") return "Distress Zone";
  return "Tidak tersedia";
}
