export type Tone = "positive" | "negative" | "warning" | "neutral" | "accent";
export type Company = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  marketCap: number;
  growth: number;
  margin: number;
  roe: number;
  debt: number;
  pe: number;
  dividend: number;
  safety: number;
  liquidity: number;
  shi: number;
  anomaly?: string;
};

export const sectors = [
  {
    name: "Technology",
    code: "IDXTECHNO",
    performance: 2.84,
    cap: 302,
    growth: 88,
    margin: 81,
    debt: 79,
    trend: "Strengthening",
  },
  {
    name: "Infrastructure",
    code: "IDXINFRA",
    performance: 1.72,
    cap: 714,
    growth: 81,
    margin: 76,
    debt: 70,
    trend: "Strengthening",
  },
  {
    name: "Financials",
    code: "IDXFINANCE",
    performance: 0.93,
    cap: 2734,
    growth: 74,
    margin: 86,
    debt: 76,
    trend: "Stable",
  },
  {
    name: "Industrials",
    code: "IDXINDUST",
    performance: 0.38,
    cap: 481,
    growth: 69,
    margin: 73,
    debt: 67,
    trend: "Stable",
  },
  {
    name: "Consumer Cyclicals",
    code: "IDXCYCLIC",
    performance: -0.21,
    cap: 426,
    growth: 72,
    margin: 60,
    debt: 57,
    trend: "Mixed",
  },
  {
    name: "Basic Materials",
    code: "IDXBASIC",
    performance: -0.64,
    cap: 1193,
    growth: 59,
    margin: 67,
    debt: 63,
    trend: "Softening",
  },
  {
    name: "Energy",
    code: "IDXENERGY",
    performance: -1.18,
    cap: 987,
    growth: 61,
    margin: 70,
    debt: 54,
    trend: "Softening",
  },
  {
    name: "Transportation",
    code: "IDXTRANS",
    performance: -1.86,
    cap: 245,
    growth: 55,
    margin: 48,
    debt: 51,
    trend: "Weakening",
  },
];

export const sectorHealth = sectors
  .map((s) => ({ ...s, score: Math.round(s.growth * 0.4 + s.margin * 0.35 + s.debt * 0.25) }))
  .sort((a, b) => b.score - a.score);

export const companies: Company[] = [
  {
    ticker: "BBCA",
    name: "Bank Central Asia",
    sector: "Financials",
    price: 10175,
    change: 1.24,
    marketCap: 1254,
    growth: 12.8,
    margin: 47.2,
    roe: 24.6,
    debt: 18,
    pe: 22.4,
    dividend: 2.3,
    safety: 91,
    liquidity: 89,
    shi: 82,
  },
  {
    ticker: "BBRI",
    name: "Bank Rakyat Indonesia",
    sector: "Financials",
    price: 5480,
    change: 0.74,
    marketCap: 830,
    growth: 9.6,
    margin: 39.8,
    roe: 19.1,
    debt: 24,
    pe: 13.1,
    dividend: 5.7,
    safety: 84,
    liquidity: 82,
    shi: 82,
  },
  {
    ticker: "BMRI",
    name: "Bank Mandiri",
    sector: "Financials",
    price: 6925,
    change: 1.09,
    marketCap: 646,
    growth: 14.2,
    margin: 42.1,
    roe: 22.7,
    debt: 22,
    pe: 11.8,
    dividend: 5.1,
    safety: 87,
    liquidity: 85,
    shi: 82,
  },
  {
    ticker: "BBNI",
    name: "Bank Negara Indonesia",
    sector: "Financials",
    price: 5275,
    change: -0.47,
    marketCap: 197,
    growth: 8.7,
    margin: 31.4,
    roe: 15.8,
    debt: 29,
    pe: 9.2,
    dividend: 6.2,
    safety: 77,
    liquidity: 74,
    shi: 82,
  },
  {
    ticker: "GOTO",
    name: "GoTo Gojek Tokopedia",
    sector: "Technology",
    price: 78,
    change: 4.0,
    marketCap: 92,
    growth: 18.5,
    margin: -3.2,
    roe: -7.4,
    debt: 12,
    pe: 0,
    dividend: 0,
    safety: 58,
    liquidity: 71,
    shi: 84,
    anomaly: "Momentum spike",
  },
  {
    ticker: "TLKM",
    name: "Telkom Indonesia",
    sector: "Infrastructure",
    price: 3260,
    change: 1.56,
    marketCap: 323,
    growth: 3.7,
    margin: 21.8,
    roe: 16.9,
    debt: 42,
    pe: 12.7,
    dividend: 6.4,
    safety: 83,
    liquidity: 78,
    shi: 76,
  },
  {
    ticker: "ASII",
    name: "Astra International",
    sector: "Industrials",
    price: 5175,
    change: -0.96,
    marketCap: 210,
    growth: 4.4,
    margin: 12.1,
    roe: 15.2,
    debt: 38,
    pe: 7.8,
    dividend: 8.1,
    safety: 80,
    liquidity: 76,
    shi: 70,
    anomaly: "Yield divergence",
  },
  {
    ticker: "AMMN",
    name: "Amman Mineral",
    sector: "Basic Materials",
    price: 8875,
    change: -2.47,
    marketCap: 643,
    growth: 21.2,
    margin: 32.4,
    roe: 18.5,
    debt: 46,
    pe: 28.7,
    dividend: 0.8,
    safety: 66,
    liquidity: 63,
    shi: 63,
    anomaly: "Valuation divergence",
  },
  {
    ticker: "ADRO",
    name: "Alamtri Resources",
    sector: "Energy",
    price: 2630,
    change: -1.13,
    marketCap: 79,
    growth: -6.8,
    margin: 24.6,
    roe: 21.3,
    debt: 20,
    pe: 5.9,
    dividend: 12.4,
    safety: 74,
    liquidity: 81,
    shi: 62,
    anomaly: "Earnings/yield mismatch",
  },
  {
    ticker: "UNVR",
    name: "Unilever Indonesia",
    sector: "Consumer Cyclicals",
    price: 1980,
    change: -1.49,
    marketCap: 76,
    growth: -8.1,
    margin: 14.8,
    roe: 98.2,
    debt: 81,
    pe: 19.8,
    dividend: 7.6,
    safety: 49,
    liquidity: 42,
    shi: 64,
    anomaly: "Leverage stress",
  },
];

export const anomalies = [
  {
    company: "AMMN",
    sector: "Basic Materials",
    metric: "P/E",
    value: "28.7x",
    average: "15.2x",
    deviation: 88.8,
    severity: "High",
    insight: "Valuation divergence detected",
  },
  {
    company: "GOTO",
    sector: "Technology",
    metric: "5D volume",
    value: "2.4B",
    average: "1.1B",
    deviation: 118.2,
    severity: "High",
    insight: "Unusual participation spike",
  },
  {
    company: "UNVR",
    sector: "Consumer",
    metric: "Debt ratio",
    value: "81.0%",
    average: "39.6%",
    deviation: 104.5,
    severity: "High",
    insight: "Leverage stress versus peers",
  },
  {
    company: "ASII",
    sector: "Industrials",
    metric: "Dividend",
    value: "8.1%",
    average: "4.6%",
    deviation: 76.1,
    severity: "Medium",
    insight: "Yield divergence; verify durability",
  },
];

export const ihsgSeries = Array.from({ length: 40 }, (_, i) => ({
  t: `${9 + Math.floor(i / 8)}:${String((i % 8) * 7).padStart(2, "0")}`,
  value: 7290 + i * 2.4 + Math.sin(i / 2.6) * 21 + (i > 25 ? 18 : 0),
  volume: 40 + Math.abs(Math.cos(i)) * 35,
}));
export const sectorSeries = Array.from({ length: 30 }, (_, i) => ({
  t: `D${i + 1}`,
  sector: 100 + Math.sin(i / 4) * 2 + i * 0.13,
  ihsg: 100 + Math.sin(i / 5) * 1.2 + i * 0.08,
}));

export const news = [
  {
    time: "09:42",
    headline: "Bank Mandiri posts double-digit loan growth as asset quality remains stable",
    company: "BMRI",
    sector: "Financials",
    source: "Kontan",
    sentiment: "Positive",
    catalyst: "Earnings",
    impact: "High",
  },
  {
    time: "09:18",
    headline: "GoTo transaction volume accelerates following ecosystem incentive reset",
    company: "GOTO",
    sector: "Technology",
    source: "Bisnis",
    sentiment: "Positive",
    catalyst: "Expansion",
    impact: "Medium",
  },
  {
    time: "08:56",
    headline: "Coal benchmark softens; exporters assess second-half margin sensitivity",
    company: "ADRO",
    sector: "Energy",
    source: "Reuters",
    sentiment: "Negative",
    catalyst: "Regulatory",
    impact: "Medium",
  },
  {
    time: "08:31",
    headline: "Telkom outlines data center capacity expansion across three regions",
    company: "TLKM",
    sector: "Infrastructure",
    source: "IDX Filing",
    sentiment: "Positive",
    catalyst: "Expansion",
    impact: "High",
  },
  {
    time: "08:04",
    headline: "Unilever Indonesia announces leadership transition effective next quarter",
    company: "UNVR",
    sector: "Consumer Cyclicals",
    source: "Company",
    sentiment: "Neutral",
    catalyst: "Management",
    impact: "Low",
  },
  {
    time: "07:48",
    headline: "Astra declares final dividend while automotive demand remains mixed",
    company: "ASII",
    sector: "Industrials",
    source: "IDX Filing",
    sentiment: "Neutral",
    catalyst: "Dividend",
    impact: "Medium",
  },
];

export const methodology = [
  {
    id: "shi",
    name: "Sector Health Index",
    purpose: "Measures the fundamental resilience and operating direction of a sector.",
    indicators: [
      "Revenue & earnings growth · 40%",
      "Margin stability · 35%",
      "Debt condition · 25%",
    ],
    formula:
      "Weighted percentile score across sector constituents, winsorized at the 5th and 95th percentiles.",
    interpretation: "80–100 strong · 65–79 healthy · 50–64 moderate · below 50 fragile",
  },
  {
    id: "dominance",
    name: "Dominance Score",
    purpose: "Compares selected companies on a common fundamental and market basis.",
    indicators: [
      "Growth · 20%",
      "Profitability · 25%",
      "ROE · 15%",
      "Debt · 15%",
      "Valuation · 15%",
      "Market performance · 10%",
    ],
    formula:
      "Cross-sectional percentile rank for the selected peer group, with debt and valuation scored inversely.",
    interpretation: "Relative comparison only; it is not an investment recommendation.",
  },
  {
    id: "safety",
    name: "Financial Safety",
    purpose: "Estimates resilience against balance-sheet and earnings stress.",
    indicators: ["Leverage · 30%", "Liquidity · 25%", "Profitability · 25%", "Stability · 20%"],
    formula:
      "Normalized composite inspired by distress-screening principles, adjusted for Indonesian sector structure.",
    interpretation: "80–100 resilient · 65–79 stable · 50–64 watch · below 50 elevated risk",
  },
  {
    id: "anomaly",
    name: "Anomaly Detection",
    purpose: "Flags observations that differ materially from relevant peer baselines.",
    indicators: [
      "Peer median",
      "Median absolute deviation",
      "Historical range",
      "Data quality confidence",
    ],
    formula:
      "Deviation is measured against sector median and flagged when robust z-score or percentage thresholds are exceeded.",
    interpretation: "An anomaly is a research prompt, not proof of mispricing.",
  },
  {
    id: "sentiment",
    name: "Sentiment Classification",
    purpose: "Classifies the likely directional tone and business catalyst of market news.",
    indicators: ["Headline language", "Event type", "Company context", "Sector transmission"],
    formula:
      "Rule-assisted classification maps news to positive, neutral, or negative tone and low, medium, or high impact.",
    interpretation: "Potential impact describes relevance, not expected price movement.",
  },
  {
    id: "decision",
    name: "Decision Matrix",
    purpose: "Groups companies that satisfy transparent combinations of configured factors.",
    indicators: [
      "SHI",
      "Growth",
      "Profitability",
      "Safety",
      "Valuation",
      "Dividend",
      "Anomaly state",
    ],
    formula:
      "Deterministic rules evaluate each company against active thresholds and classification templates.",
    interpretation: "Classifications support research prioritization and are not buy/sell calls.",
  },
];

export const formatIDR = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : n.toLocaleString("id-ID");
export const healthLabel = (score: number) =>
  score >= 80 ? "Strong" : score >= 65 ? "Healthy" : score >= 50 ? "Moderate" : "Fragile";
export const classify = (c: Company) =>
  c.dividend >= 7 && c.safety < 65
    ? "Dividend Trap Alert"
    : c.growth >= 12 && c.pe > 0 && c.pe <= 22
      ? "Growth at Reasonable Price"
      : c.pe > 0 && c.pe <= 14 && c.margin >= 20 && c.safety >= 75
        ? "Undervalued Quality"
        : "Balanced Fundamentals";
export const dominanceScore = (c: Company) =>
  Math.round(
    Math.max(
      0,
      Math.min(
        100,
        50 +
          c.growth * 0.7 +
          c.margin * 0.35 +
          c.roe * 0.25 -
          c.debt * 0.18 -
          (c.pe || 20) * 0.25 +
          c.change * 1.2,
      ),
    ),
  );
