/**
 * Endpoint Registry — Sectors API v2
 * ------------------------------------------------------------------
 * Source of truth for every endpoint the proxy is allowed to forward.
 *
 * WHY THIS EXISTS:
 *   Sectors API billing: 2xx AND 404 are CHARGED. Only 400/401/403/429/5xx
 *   are free. A request for a non-existent symbol/slug costs 1 credit
 *   (the DB query ran). This registry validates EVERY request locally
 *   before it reaches upstream. Invalid requests return HTTP 400 from our
 *   proxy — costing zero credits.
 *
 *   The usage log (usage-log_2026-09-23.csv) shows 50+ charged 404s for
 *   wrong subsector slugs (telecommunications, coal, heavy-constructions).
 *   Those never reach upstream again.
 *
 * USAGE in sectors.ts:
 *   const match = matchEndpoint(req.path, req.query);
 *   if (!match) return res.status(400).json({ ... });  // free, no credit
 *   // match.ttl, match.creditCost, match.adapter are now available
 */

import { TTL, CREDIT_COST, getDailyPriceTTL } from "../config/cache-ttl";

// ── Types ────────────────────────────────────────────────────────────────
export type AdapterName =
  | "passthrough"
  | "index-daily"
  | "idx-total"
  | "foreign-flow-symbol"
  | "companies-top-changes"
  | "subsector-report"
  | "company-report"
  | "subsectors-list"
  | "daily-symbol"
  | "news"
  | "corporate-actions"
  | "suspensions"
  | "brokers-top"
  | "broker-activity"
  | "broker-summary"
  | "broker-summary-top"
  | "broker-activity-top"
  | "companies"
  | "free-float"
  | "close"
  | "listing-performance"
  | "quarterly-financial-dates"
  | "company-quarterly-dates"
  | "segments"
  | "financials-quarterly"
  | "filings"
  | "most-traded"
  | "shareholders-composition"
  | "company-corporate-actions"
  | "tags"
  | "industries"
  | "subindustries"
  | "list-companies-with-segments";

export interface EndpointMatch {
  ttl: number;
  creditCost: number;
  adapter: AdapterName;
  /** Path params extracted by the regex (e.g. { symbol: "BBCA" }) */
  params: Record<string, string>;
  /** Whether this endpoint requires a valid index/symbol/slug param */
  requiresPathParam: boolean;
}

interface EndpointDef {
  /**
   * Regex tested against req.path WITH the mount prefix stripped.
   * Express mounts this router at /api/sectors, so req.path here is
   * e.g. "/index-daily/ihsg/" — NOT "/v2/index-daily/ihsg/".
   * The upstream base URL already includes /v2, so paths never contain it.
   */
  pattern: RegExp;
  /** Named capture groups in pattern → param keys */
  paramKeys: string[];
  ttl: number | (() => number);
  creditCost: number;
  adapter: AdapterName;
  requiresPathParam: boolean;
}

// ── Valid index codes (from /v2/index-daily/{index_code}/ docs) ──────────
const VALID_INDEX_CODES = new Set([
  "ihsg", "lq45", "idx30", "idxbumn20", "idxesgl", "idxg30",
  "idxhidiv20", "idxq30", "idxv30", "jii70", "kompas100",
  "sminfra18", "srikehati", "sti", "economic30", "idxvesta28", "ftse",
]);

// ── Minimal ticker validation: 1-4 uppercase letters, optional .JK ───────
const TICKER_RE = /^[A-Z]{1,5}(\.JK)?$/;
// Broker codes: 2 uppercase letters
const BROKER_RE = /^[A-Z]{2}$/;

// ── Endpoint definitions ─────────────────────────────────────────────────
// Order matters: more specific patterns first.
const ENDPOINTS: EndpointDef[] = [
  // ── Transactions ──────────────────────────────────────────────────────
  {
    pattern: /^\/index-daily\/([a-z0-9]+)\/?$/,
    paramKeys: ["index_code"],
    ttl: () => getDailyPriceTTL(),
    creditCost: CREDIT_COST["index-daily"] ?? 1,
    adapter: "index-daily",
    requiresPathParam: true,
  },
  {
    pattern: /^\/index-daily\/?$/,
    paramKeys: [],
    ttl: () => getDailyPriceTTL(),
    creditCost: 1,
    adapter: "index-daily",
    requiresPathParam: false,
  },
  {
    pattern: /^\/idx-total\/?$/,
    paramKeys: [],
    ttl: () => getDailyPriceTTL(),
    creditCost: CREDIT_COST["idx-total"] ?? 1,
    adapter: "idx-total",
    requiresPathParam: false,
  },
  {
    pattern: /^\/daily\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: () => getDailyPriceTTL(),
    creditCost: CREDIT_COST["daily"] ?? 1,
    adapter: "daily-symbol",
    requiresPathParam: true,
  },
  {
    pattern: /^\/close\/?$/,
    paramKeys: [],
    ttl: () => getDailyPriceTTL(),
    creditCost: 1,
    adapter: "close",
    requiresPathParam: false,
  },
  {
    pattern: /^\/foreign-flow\/?$/,
    paramKeys: [],
    ttl: TTL.foreignFlow,
    creditCost: 1,
    adapter: "passthrough",
    requiresPathParam: false,
  },
  {
    pattern: /^\/foreign-flow\/([A-Z]{1,5})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.foreignFlow,
    creditCost: CREDIT_COST["foreign-flow"] ?? 1,
    adapter: "foreign-flow-symbol",
    requiresPathParam: true,
  },

  // ── Reports ───────────────────────────────────────────────────────────
  {
    pattern: /^\/company\/report\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.companyReport,
    creditCost: CREDIT_COST["company/report"] ?? 8,
    adapter: "company-report",
    requiresPathParam: true,
  },
  {
    pattern: /^\/subsector\/report\/([a-z0-9-]+)\/?$/,
    paramKeys: ["sub_sector"],
    ttl: TTL.subsectorReport,
    creditCost: CREDIT_COST["subsector/report"] ?? 3,
    adapter: "subsector-report",
    requiresPathParam: true,
  },
  {
    pattern: /^\/company\/get-segments\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.companyReport,
    creditCost: 1,
    adapter: "segments",
    requiresPathParam: true,
  },
  {
    pattern: /^\/financials\/quarterly\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.companyFinancials,
    creditCost: 1,
    adapter: "financials-quarterly",
    requiresPathParam: true,
  },

  // ── Rankings ──────────────────────────────────────────────────────────
  {
    pattern: /^\/companies\/top-changes\/?$/,
    paramKeys: [],
    ttl: () => getDailyPriceTTL(),
    creditCost: 2,
    adapter: "companies-top-changes",
    requiresPathParam: false,
  },
  {
    pattern: /^\/most-traded\/?$/,
    paramKeys: [],
    ttl: TTL.brokerSummary,
    creditCost: CREDIT_COST["most-traded"] ?? 2,
    adapter: "most-traded",
    requiresPathParam: false,
  },

  // ── Screener ──────────────────────────────────────────────────────────
  {
    pattern: /^\/companies\/?$/,
    paramKeys: [],
    ttl: TTL.companyList,
    creditCost: 1,
    adapter: "companies",
    requiresPathParam: false,
  },
  {
    pattern: /^\/free-float\/?$/,
    paramKeys: [],
    ttl: TTL.companyList,
    creditCost: 1,
    adapter: "free-float",
    requiresPathParam: false,
  },

  // ── Brokers ───────────────────────────────────────────────────────────
  {
    pattern: /^\/brokers\/?$/,
    paramKeys: [],
    ttl: TTL.tags,
    creditCost: 1,
    adapter: "passthrough",
    requiresPathParam: false,
  },
  {
    pattern: /^\/brokers\/top\/?$/,
    paramKeys: [],
    ttl: TTL.brokerTop,
    creditCost: CREDIT_COST["brokers/top"] ?? 2,
    adapter: "brokers-top",
    requiresPathParam: false,
  },
  {
    pattern: /^\/broker-activity\/([A-Z]{2})\/top\/?$/,
    paramKeys: ["broker_code"],
    ttl: TTL.brokerSummary,
    creditCost: 2,
    adapter: "broker-activity-top",
    requiresPathParam: true,
  },
  {
    pattern: /^\/broker-activity\/([A-Z]{2})\/?$/,
    paramKeys: ["broker_code"],
    ttl: TTL.brokerSummary,
    creditCost: 1,
    adapter: "broker-activity",
    requiresPathParam: true,
  },
  {
    pattern: /^\/broker-summary\/([A-Z.]{1,7})\/top\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.brokerSummary,
    creditCost: 2,
    adapter: "broker-summary-top",
    requiresPathParam: true,
  },
  {
    pattern: /^\/broker-summary\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.brokerSummary,
    creditCost: 1,
    adapter: "broker-summary",
    requiresPathParam: true,
  },

  // ── News & Events ─────────────────────────────────────────────────────
  {
    pattern: /^\/news\/?$/,
    paramKeys: [],
    ttl: TTL.news,
    creditCost: 1,
    adapter: "news",
    requiresPathParam: false,
  },
  {
    pattern: /^\/filings\/?$/,
    paramKeys: [],
    ttl: TTL.news,
    creditCost: 1,
    adapter: "filings",
    requiresPathParam: false,
  },
  {
    pattern: /^\/corporate-actions\/?$/,
    paramKeys: [],
    ttl: TTL.corporateActions,
    creditCost: 1,
    adapter: "corporate-actions",
    requiresPathParam: false,
  },
  {
    pattern: /^\/suspensions\/?$/,
    paramKeys: [],
    ttl: TTL.suspensions,
    creditCost: 1,
    adapter: "suspensions",
    requiresPathParam: false,
  },

  // ── Company-specific endpoints ────────────────────────────────────────
  {
    pattern: /^\/company\/corporate-actions\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.corporateActions,
    creditCost: 1,
    adapter: "company-corporate-actions",
    requiresPathParam: true,
  },
  {
    pattern: /^\/company\/shareholders-composition\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.companyReport,
    creditCost: 1,
    adapter: "shareholders-composition",
    requiresPathParam: true,
  },
  {
    pattern: /^\/company\/get_quarterly_financial_dates\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.tags,
    creditCost: 1,
    adapter: "company-quarterly-dates",
    requiresPathParam: true,
  },
  {
    pattern: /^\/listing-performance\/([A-Z.]{1,7})\/?$/,
    paramKeys: ["symbol"],
    ttl: TTL.companyReport,
    creditCost: 1,
    adapter: "listing-performance",
    requiresPathParam: true,
  },

  // ── Helper lists ──────────────────────────────────────────────────────
  {
    pattern: /^\/subsectors\/?$/,
    paramKeys: [],
    ttl: TTL.subsectorList,
    creditCost: 1,
    adapter: "subsectors-list",
    requiresPathParam: false,
  },
  {
    pattern: /^\/industries\/?$/,
    paramKeys: [],
    ttl: TTL.subsectorList,
    creditCost: 1,
    adapter: "industries",
    requiresPathParam: false,
  },
  {
    pattern: /^\/subindustries\/?$/,
    paramKeys: [],
    ttl: TTL.subsectorList,
    creditCost: 1,
    adapter: "subindustries",
    requiresPathParam: false,
  },
  {
    pattern: /^\/tags\/?$/,
    paramKeys: [],
    ttl: TTL.tags,
    creditCost: 1,
    adapter: "tags",
    requiresPathParam: false,
  },
  {
    pattern: /^\/companies\/list_companies_with_segments\/?$/,
    paramKeys: [],
    ttl: TTL.companyList,
    creditCost: 1,
    adapter: "list-companies-with-segments",
    requiresPathParam: false,
  },
  {
    pattern: /^\/companies\/quarterly-financial-dates\/?$/,
    paramKeys: [],
    ttl: TTL.companyList,
    creditCost: 1,
    adapter: "quarterly-financial-dates",
    requiresPathParam: false,
  },
];

// ── Valid subsector slugs — fetched dynamically from /v2/subsectors/ ─────
// Populated on first call to /v2/subsectors/ and cached in Redis (7d TTL).
// Until populated, we use a static fallback derived from the API docs.
export const FALLBACK_VALID_SUBSECTORS = new Set([
  "banks", "software-it-services", "retailing", "transportation",
  "basic-materials", "telecommunication", "oil-gas-coal",
  "financing-service", "investment-service", "apparel-luxury-goods",
  "construction-materials", "wireless-telecommunication-services",
  "integrated-telecommunication-service", "oil-gas-storage-distribution",
  "oil-gas-production-refinery", "machinery",
  "construction-machinery-heavy-vehicles",
  "highways-railtracks", "transport-infrastructure-operator",
]);

// Runtime set — updated when /v2/subsectors/ is fetched
let runtimeValidSubsectors: Set<string> | null = null;

export function setValidSubsectors(slugs: string[]): void {
  runtimeValidSubsectors = new Set(slugs);
}

export function getValidSubsectors(): Set<string> | null {
  return runtimeValidSubsectors;
}

// ── Main matcher ──────────────────────────────────────────────────────────
/**
 * Validates req.path against the endpoint registry.
 * Returns null if the path doesn't match any known endpoint (→ 400, free)
 * or if a path param fails validation (→ 400, free).
 */
export function matchEndpoint(
  reqPath: string,
): EndpointMatch | null {
  for (const def of ENDPOINTS) {
    const m = def.pattern.exec(reqPath);
    if (!m) continue;

    const params: Record<string, string> = {};
    def.paramKeys.forEach((key, i) => {
      params[key] = decodeURIComponent(m[i + 1]);
    });

    // Validate path params — reject early (400, free) if invalid
    if (def.requiresPathParam) {
      if (!validatePathParam(def.adapter, params)) {
        return null;
      }
    }

    return {
      ttl: typeof def.ttl === "function" ? def.ttl() : def.ttl,
      creditCost: def.creditCost,
      adapter: def.adapter,
      params,
      requiresPathParam: def.requiresPathParam,
    };
  }
  return null;
}

function validatePathParam(
  adapter: AdapterName,
  params: Record<string, string>,
): boolean {
  const symbol = params["symbol"];
  const indexCode = params["index_code"];
  const brokerCode = params["broker_code"];
  const subSector = params["sub_sector"];

  switch (adapter) {
    case "index-daily":
      return !!indexCode && VALID_INDEX_CODES.has(indexCode.toLowerCase());

    case "daily-symbol":
    case "company-report":
    case "broker-summary":
    case "broker-summary-top":
    case "segments":
    case "financials-quarterly":
    case "company-corporate-actions":
    case "shareholders-composition":
    case "company-quarterly-dates":
    case "listing-performance":
      return !!symbol && TICKER_RE.test(symbol);

    case "foreign-flow-symbol":
      // IHSG is valid for foreign-flow, plus normal tickers
      return !!symbol && (symbol === "IHSG" || TICKER_RE.test(symbol));

    case "broker-activity":
    case "broker-activity-top":
      return !!brokerCode && BROKER_RE.test(brokerCode);

    case "subsector-report": {
      if (!subSector) return false;
      const valid = runtimeValidSubsectors ?? FALLBACK_VALID_SUBSECTORS;
      return valid.has(subSector);
    }

    default:
      return true;
  }
}

// ── Query param validation ────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates common query params. Returns an error message string if invalid
 * (→ 400, free), or null if OK.
 */
export function validateQueryParams(
  adapter: AdapterName,
  query: Record<string, unknown>,
): string | null {
  const start = query["start"] as string | undefined;
  const end = query["end"] as string | undefined;

  // Date format validation
  if (start && !DATE_RE.test(start)) return "Invalid start date format (use YYYY-MM-DD)";
  if (end && !DATE_RE.test(end)) return "Invalid end date format (use YYYY-MM-DD)";

  // Future date check — API returns 400 for future end dates (free), but
  // we catch it here too to avoid the round-trip.
  if (end) {
    const today = new Date().toISOString().slice(0, 10);
    if (end > today) return "End date cannot be in the future";
  }

  // sections validation for report endpoints
  if (adapter === "company-report" || adapter === "subsector-report") {
    const sections = query["sections"] as string | undefined;
    if (sections) {
      const validCompany = ["overview", "valuation", "future", "peers", "financials", "dividend", "management", "ownership"];
      const validSubsector = ["statistics", "market_cap", "stability", "valuation", "growth", "companies"];
      const valid = adapter === "company-report" ? validCompany : validSubsector;
      const parts = sections.split(",").map((s) => s.trim());
      for (const p of parts) {
        if (!valid.includes(p)) return `Invalid section: ${p}`;
      }
    }
  }

  // news requires extension
  if (adapter === "news") {
    const ext = query["extension"] as string | undefined;
    if (!ext || !["idx", "mining"].includes(ext)) {
      return "News endpoint requires extension=idx or extension=mining";
    }
  }

  return null;
}
