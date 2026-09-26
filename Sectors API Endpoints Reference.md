# Sectors API v2 — Complete Endpoint Reference

> Base URL: `https://api.sectors.app/v2`  
> Auth: `Authorization: <API_KEY>` header (raw key, no "Bearer" prefix)  
> All params are **query string** unless marked **(path)**.  
> Dates: `YYYY-MM-DD` format. Future dates return 400. Past limit returns 400.  
> Pagination: `limit` (max 30) + `offset`.

---

## Billing Rules (2026-07-31)
| Status | Cost |
|---|---|
| 2xx / 404 | Charged at endpoint's stated credit cost |
| 400 / 401 / 403 / 429 / 5xx | Free |
| Screener `?q=` (NLQ) after LLM call | 1 credit even on 400 |

---

## IDX — Brokers

### `GET /v2/brokers/`
Curated registry of IDX exchange-member brokers.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns full list |

---

### `GET /v2/brokers/top/`
Brokers ranked by gross trade value or net flow for a single date.  
**Credits:** 2  
| Param | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD`. Defaults to most recent trading day |
| `n_brokers` | integer | Limit results; omit for all |
| `origin` | string | `foreign` or `domestic` |
| `cohort` | string | `retail`, `mixed`, `institutional`, `unknown` |
| `foreign` | boolean | `true` = rank by foreign-investor flow instead of totals |

---

### `GET /v2/broker-activity/{broker_code}/`
All (stock, day) trading activity for one broker over a date range.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `broker_code` **(path)** | string | Two-letter code, e.g. `MG`, `AK`. Get list from `/v2/brokers/` |
| `start` | string | `YYYY-MM-DD`. Max range: **14 days** |
| `end` | string | `YYYY-MM-DD` |
| `symbol` | string | Optional. Filter to one IDX ticker, e.g. `BBCA` |

---

### `GET /v2/broker-activity/{broker_code}/top/`
Stocks a broker has been most actively accumulating/distributing.  
**Credits:** 2  
| Param | Type | Notes |
|---|---|---|
| `broker_code` **(path)** | string | Two-letter code |
| `start` | string | `YYYY-MM-DD`. Max range: **14 days** |
| `end` | string | `YYYY-MM-DD` |
| `foreign` | boolean | `true` = rank by foreign-investor flow |

---

### `GET /v2/broker-summary/{symbol}/`
Per-broker daily trading rows for one IDX ticker.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk`. E.g. `BBCA` |
| `start` | string | `YYYY-MM-DD`. Max range: **14 days** |
| `end` | string | `YYYY-MM-DD` |
| `broker_code` | string | Optional. Filter to one broker |

---

### `GET /v2/broker-summary/{symbol}/top/`
Brokers most actively accumulating/distributing a single IDX ticker.  
**Credits:** 2  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk` |
| `start` | string | `YYYY-MM-DD`. Max range: **14 days** |
| `end` | string | `YYYY-MM-DD` |
| `foreign` | boolean | `true` = rank by foreign-investor flow |
| `origin` | string | `foreign` or `domestic` (broker registry classification) |

---

### `GET /v2/foreign-flow/`
Net foreign-investor flow for **every** IDX ticker on a single day.  
**Credits:** 1 per page (full universe ≈ 20–25 pages at `limit=30`)  
| Param | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD`. Defaults to most recent trading day |
| `order_by` | string | Default desc. Pass `net_foreign_inflow` for asc (top sellers first) |
| `limit` | integer | Max 30 |
| `offset` | integer | Pagination offset |

---

### `GET /v2/foreign-flow/{symbol}/`
Daily net foreign-investor inflow for one IDX ticker over a date range.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker or `IHSG` for market-wide series |
| `start` | string | `YYYY-MM-DD`. Max range: 90 days |
| `end` | string | `YYYY-MM-DD` |

---

## IDX — Company

### `GET /v2/company/corporate-actions/{symbol}/`
All corporate action history for one IDX company.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk`. E.g. `BBCA` |

---

### `GET /v2/company/shareholders-composition/{symbol}/`
Monthly shareholder composition snapshots for one IDX company within a calendar year.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk` |
| `year` | integer | Calendar year. Data available from 2021 onwards |

---

## IDX — Helper Lists

### `GET /v2/subsectors/`
All sector/subsector pairs as kebab-case slugs.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns full list |

---

### `GET /v2/industries/`
All subsector/industry pairs as kebab-case slugs.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns full list |

---

### `GET /v2/subindustries/`
All industry/sub-industry pairs as kebab-case slugs.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns full list |

---

### `GET /v2/tags/`
All available tag slugs for news and company filings.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns sorted alphabetical array |

---

### `GET /v2/companies/list_companies_with_segments/`
Dictionary of all companies with available revenue/cost segment data.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns company slug → available years |

---

### `GET /v2/company/get_quarterly_financial_dates/{symbol}/`
All available quarterly report dates for a symbol, grouped by year with Q1–Q4 labels.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk`. E.g. `BBCA` |

---

### `GET /v2/companies/quarterly-financial-dates/`
Latest quarterly report date for every IDX company — paginated, built for freshness polling.  
**Credits:** 1 per page (full universe ≈ 32 pages at `limit=30`)  
| Param | Type | Notes |
|---|---|---|
| `since` | string | `YYYY-MM-DD`. Return only companies that reported a new quarter after this date |
| `limit` | integer | Max 30 |
| `offset` | integer | Pagination offset |

---

## IDX — IPO

### `GET /v2/listing-performance/{symbol}/`
Price change percentages since listing across 7, 30, 90, and 365-day windows.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk`. Only tickers listed **after May 2005** |

---

## IDX — News & Events

### `GET /v2/news/`
Paginated news articles from IDX or mining sources.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `extension` | string | **Required.** `idx` or `mining` |
| `start` | string | `YYYY-MM-DD` |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |
| `limit` | integer | Pagination |
| `offset` | integer | Pagination |
| **IDX-only params** (`extension=idx`) | | |
| `sector` | string | Comma-separated kebab-case sector slugs |
| `sub_sector` | string | Comma-separated subsector slugs, e.g. `banks,insurance` |
| `tags` | string | Comma-separated tag slugs |
| `symbols` | string | Comma-separated IDX tickers, e.g. `BBCA,BBRI` |
| `keyword` | string | Case-insensitive substring match on article title |
| **Mining-only params** (`extension=mining`) | | |
| `keyword` | string | Case-insensitive substring match |
| `commodity_type` | string | E.g. `Coal`, `Nickel`, `Gold` |

---

### `GET /v2/filings/`
IDX insider trading filings (buy/sell by insiders/major shareholders).  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` | string | IDX ticker filter |
| `sector` | string | Kebab-case sector slug |
| `subsector` | string | Kebab-case subsector slug |
| `tags` | string | Comma-separated tag slugs |
| `transaction_type` | string | Transaction type filter |
| `holder_type` | string | Holder classification filter |
| `start` | string | `YYYY-MM-DD` |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |

---

### `GET /v2/corporate-actions/`
Corporate actions calendar across every IDX ticker in a date window.  
**Credits:** 1 per requested `type` (default all 7 types = 7 credits)  
| Param | Type | Notes |
|---|---|---|
| `start` | string | `YYYY-MM-DD`. Default: today − 30 days |
| `end` | string | `YYYY-MM-DD`. May be future (calendar mode). Default: today + 30 days. Max window clamped to 90 days ending at `end` |
| `type` | string | Comma-separated: `dividend`, `upcoming_dividend`, `bonus`, `right_issue`, `stock_split`, `warrant`, `agm` |
| `symbol` | string | Filter to one IDX ticker |

---

### `GET /v2/suspensions/`
Historical IDX stock suspension records.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` | string | Filter to one IDX ticker |
| `start` | string | `YYYY-MM-DD` |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |
| `limit` | integer | Pagination |
| `offset` | integer | Pagination |

---

## IDX — Rankings

### `GET /v2/most-traded/`
Most traded IDX stocks by transaction volume over a date range.  
**Credits:** 2  
| Param | Type | Notes |
|---|---|---|
| `start` | string | `YYYY-MM-DD`. Defaults to 30 days ago. Max window 90 days |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |

---

### `GET /v2/companies/top-changes/`
Top gainers and losers across multiple time periods.  
**Credits:** 1 per classification × period (default 2 × 5 = 10 credits)  
| Param | Type | Notes |
|---|---|---|
| `classifications` | string | Comma-separated: `top_gainers`, `top_losers`. Default: both |
| `periods` | string | Comma-separated: `1d`, `7d`, `14d`, `30d`, `365d`. Default: all 5 |
| `n_stock` | integer | Number of stocks per group. Default: 5 |

---

## IDX — Reports

### `GET /v2/company/report/{symbol}/`
Comprehensive company report in up to 8 sections.  
**Credits:** 1 per section (default all 8 = 8 credits)  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk`. E.g. `BBCA` |
| `sections` | string | Comma-separated sections to return: `overview`, `valuation`, `future`, `peers`, `financials`, `dividend`, `management`, `ownership` |

---

### `GET /v2/company/get-segments/{symbol}/`
Sankey-graph-ready revenue and cost segment breakdown.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk` |
| `year` | integer | Financial year |

---

### `GET /v2/financials/quarterly/{symbol}/`
Quarterly financial data for one IDX symbol.  
**Credits:** 1 per quarter returned  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk` |
| `report_date` | string | `YYYY-MM-DD`. Get valid dates from `/v2/company/get_quarterly_financial_dates/{symbol}/` |

---

### `GET /v2/subsector/report/{sub_sector}/`
Comprehensive subsector report in up to 6 sections.  
**Credits:** 1 per section (default all 6 = 6 credits)  
| Param | Type | Notes |
|---|---|---|
| `sub_sector` **(path)** | string | Kebab-case subsector slug. Get valid values from `/v2/subsectors/`. E.g. `banks`, `oil-gas-coal`, `telecommunication` |
| `sections` | string | Comma-separated: `statistics`, `market_cap`, `stability`, `valuation`, `growth`, `companies` |

---

## IDX — Screener

### `GET /v2/companies/`
Filter and sort IDX-listed companies. Two mutually exclusive query modes.  
**Credits:** 1 (structured) / 3 (NLQ `?q=`)  
| Param | Type | Notes |
|---|---|---|
| `q` | string | Natural language query, e.g. `top 10 banks by revenue`. **Costs 3 credits. Overrides all other params.** |
| `where` | string | SQL-like filter. E.g. `market_cap > 1000000000000 and sector = 'Financials'`. See field reference below |
| `order_by` | string | Field to sort by. Prefix with `-` for descending. E.g. `-market_cap`. Supports arithmetic: `-(revenue[2024]/total_assets[2024])` |
| `limit` | integer | Max 30 |
| `offset` | integer | Pagination |
| `include_query_values` | boolean | Include parsed `query_values` in response |

**Key `where` field categories:**
- **Direct:** `symbol`, `company_name`, `sector`, `sub_sector`, `industry`, `sub_industry`, `market_cap`, `market_cap_rank`, `last_close_price`, `daily_close_change`, `listing_board`, `listing_date`, `employee_num`, `forward_pe`, `intrinsic_value`, `esg_score`, `yield_ttm`, `dividend_ttm`, `payout_ratio`, `yoy_quarter_earnings_growth`, `yoy_quarter_revenue_growth`
- **Arrays (`in` operator):** `tags`, `indices`, `affiliates`
- **MRQ/TTM snapshots:** `pe_ttm`, `pb_mrq`, `ps_ttm`, `dar_mrq`, `der_mrq`, `roa_ttm`, `roe_ttm`, `total_assets_mrq`, `earnings_mrq`, `yearly_mcap_change`, `52_w_high_price`, `52_w_low_price`, `90_d_high_price`, `all_time_high_price`, etc.
- **Yearly `field[YYYY]`:** `revenue`, `earnings`, `eps`, `eps_growth`, `total_dividend`, `roa`, `roe`, `pe`, `pb`, `ps`, `pcf`, `peg`, `debt_to_asset_ratio`, `debt_to_equity_ratio`, `net_profit_margin`, `gross_profit_margin`, `free_cash_flow`, `operating_cash_flow`, `total_assets`, `total_equity`, `total_debt`, and 50+ more
- **Quarterly `field[Qi-YYYY]`:** `revenue_q`, `earnings_q`, `ebit_q`, `ebitda_q`, `total_assets_q`, `total_equity_q`, `operating_cash_flow_q`, and 30+ more
- **List JSON:** `major_shareholders_name`, `major_shareholders_share_percentage`, `key_executives_name`, `key_executives_position`, `free_float`

---

### `GET /v2/free-float/`
Free float percentage for IDX companies. At most one filter param per request.  
**Credits:** 1 per 100 companies returned (rounded up)  
| Param | Type | Notes |
|---|---|---|
| `sector` | string | Kebab-case sector slug |
| `sub_sector` | string | Kebab-case subsector slug |
| `industry` | string | Kebab-case industry slug |
| `sub_industry` | string | Kebab-case sub-industry slug |

---

## IDX — Transactions

### `GET /v2/close/`
Daily close price for **every** IDX ticker on a single day — paginated.  
**Credits:** 1 per page (full ~950-ticker universe ≈ 32 pages at `limit=30`)  
| Param | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD`. Defaults to most recent trading day |
| `limit` | integer | Max 30 |
| `offset` | integer | Pagination |

---

### `GET /v2/daily/{symbol}/`
Daily close price, volume, and market cap for one IDX symbol.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-letter IDX ticker, optional `.jk`. E.g. `BBCA` |
| `start` | string | `YYYY-MM-DD`. Max range: 90 days |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |

**Response fields:** `date`, `close`, `volume`, `market_cap`

---

### `GET /v2/idx-total/`
Historical total IDX market capitalisation over a date range.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `start` | string | `YYYY-MM-DD`. Earliest available: **2021-01-01**. Max range: 90 days |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |

**Response fields:** `date`, `idx_total_market_cap`

---

### `GET /v2/index-daily/{index_code}/`
Daily closing price for one IDX index over a date range.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `index_code` **(path)** | string | One of: `ihsg`, `lq45`, `idx30`, `idxbumn20`, `idxesgl`, `idxg30`, `idxhidiv20`, `idxq30`, `idxv30`, `jii70`, `kompas100`, `sminfra18`, `srikehati`, `sti`, `economic30`, `idxvesta28`, `ftse`. Earliest: **2019-01-02** |
| `start` | string | `YYYY-MM-DD`. Max range: 90 days |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |

**Response fields:** `date`, `close`

---

### `GET /v2/index-daily/`
Closing level of **every** IDX index on a single trading day.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD`. Defaults to most recent trading day |

---

## KLSE (Malaysia)

### `GET /v2/klse/sectors/`
All available KLSE sector slugs.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns flat array of slugs |

---

### `GET /v2/klse/companies/`
All KLSE-listed companies in a given sector.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `sector` | string | Kebab-case KLSE sector slug from `/v2/klse/sectors/`. E.g. `financials`, `healthcare` |

---

### `GET /v2/klse/company/report/{symbol}/`
Comprehensive company report for a KLSE-listed symbol.  
**Credits:** 1 per section (default all 4 = 4 credits)  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 4-digit numeric code. E.g. `1155`, `4197`, `5225` |
| `sections` | string | Comma-separated: `overview`, `valuation`, `financials`, `dividend` |

---

### `GET /v2/klse/companies/top/`
Top KLSE companies ranked by classification.  
**Credits:** 1 per classification (default all 5 = 5 credits)  
| Param | Type | Notes |
|---|---|---|
| `classifications` | string | Comma-separated: `dividend_yield`, `revenue`, `earnings`, `market_cap`, `pe` |
| `sector` | string | Kebab-case KLSE sector slug to filter |
| `n_stock` | integer | Number of companies per classification |

---

## SGX (Singapore)

### `GET /v2/sgx/sectors/`
All available SGX sector slugs.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns flat array |

---

### `GET /v2/sgx/subsectors/`
All SGX sector/subsector pairs as kebab-case slugs.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns full list |

---

### `GET /v2/sgx/tags/`
All distinct tag slugs across SGX news articles.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Returns full list |

---

### `GET /v2/sgx/news/`
Paginated SGX news articles.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `sector` | string | SGX sector slug |
| `sub_sector` | string | SGX subsector slug |
| `tags` | string | Comma-separated tag slugs |
| `symbols` | string | Comma-separated SGX tickers, e.g. `D05,U11` |
| `keyword` | string | Substring match on article title |
| `start` | string | `YYYY-MM-DD` |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |
| `limit` | integer | Pagination |
| `offset` | integer | Pagination |

---

### `GET /v2/sgx/filings/`
SGX insider trading filings.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` | string | SGX ticker, optional `.SI`. E.g. `D05` |
| `transaction_type` | string | Transaction type filter |
| `holder_type` | string | Holder classification filter |
| `start` | string | `YYYY-MM-DD` |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |

---

### `GET /v2/sgx/companies/top/`
Top SGX companies ranked by classification.  
**Credits:** 1 per classification (default all 5 = 5 credits)  
| Param | Type | Notes |
|---|---|---|
| `classifications` | string | Comma-separated: `dividend_yield`, `revenue`, `earnings`, `market_cap`, `pe` |
| `sector` | string | SGX sector slug to filter |
| `n_stock` | integer | Number of companies per classification |

---

### `GET /v2/sgx/company/report/{symbol}/`
Comprehensive report for one SGX-listed company.  
**Credits:** 1 per section (default all 4 = 4 credits)  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 3–4 char SGX ticker, optional `.SI`. E.g. `D05`, `U11`, `Z74` |
| `sections` | string | Comma-separated: `overview`, `valuation`, `financials`, `dividend` |

---

### `GET /v2/sgx/companies/`
Filter and sort SGX-listed companies. Two mutually exclusive query modes.  
**Credits:** 1 (structured) / 3 (NLQ `?q=`)  
| Param | Type | Notes |
|---|---|---|
| `q` | string | Natural language, e.g. `top 5 SGX banks by market cap`. **Costs 3 credits** |
| `where` | string | SQL-like filter. Same syntax as IDX screener |
| `order_by` | string | Field to sort. Prefix `-` for descending |
| `limit` | integer | Max 30 |
| `offset` | integer | Pagination |

**Key SGX `where` fields:**
- **Direct:** `symbol`, `company_name`, `sector`, `sub_sector`, `market_cap`, `last_close_price`, `employee_num`, `pe`, `eps`, `beta`, `ps`, `pcf`, `pb`, `gross_margin`, `operating_margin`, `net_profit_margin`, `quick_ratio`, `current_ratio`, `debt_to_equity`, `forward_dividend_yield`, `payout_ratio`, `change_1d`, `change_7d`, `change_1m`, `change_ytd`, `change_1y`, `change_3y`
- **Price extremes:** `52_w_high_price`, `52_w_low_price`, `90_d_high_price`, `ytd_high_price`, `all_time_high_price`, etc.
- **Arrays:** `tags`
- **Yearly `field[YYYY]`:** `revenue`, `earnings`, `total_dividend`, `total_yield`, `operating_cash_flow` *(Big caps)*, `ebit` *(Big caps)*, `ebitda` *(Big caps)*, `net_interest_income` *(Banks only)*, `net_loan` *(Banks only)*, `total_deposit` *(Banks only)*, `core_capital_tier1` *(Banks only)*, and more

> **SGX limitations:** No `free_float`, no peer averages, no quarterly data, no ownership/executive queries.

---

### `GET /v2/sgx/close/`
Daily close price for **every** SGX ticker on a single trading day — paginated.  
**Credits:** 1 per page (full ~560–600 ticker universe ≈ 20 pages at `limit=30`)  
| Param | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD`. Defaults to most recent trading day |
| `limit` | integer | Max 30 |
| `offset` | integer | Pagination |

---

### `GET /v2/sgx/daily/{symbol}/`
Daily close price and volume for one SGX company.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` **(path)** | string | 3–4 char SGX ticker. E.g. `D05` |
| `start` | string | `YYYY-MM-DD`. Max range: 90 days |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |

---

### `GET /v2/sgx/buybacks/`
SGX share buyback records.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` | string | SGX ticker, optional `.SI` |
| `start` | string | `YYYY-MM-DD` |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |

---

### `GET /v2/sgx/short-sell/`
SGX short sell data.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `symbol` | string | SGX ticker, optional `.SI` |
| `start` | string | `YYYY-MM-DD` |
| `end` | string | `YYYY-MM-DD`. Future dates return 400 |
| `order_by` | string | Field to sort. Prefix `-` for descending, e.g. `-value` |

---

## Mining

### `GET /v2/mining/commodities/`
Lists all commodities available in the price database.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | Discovery endpoint |

---

### `GET /v2/mining/commodities/{commodity_name}/price/`
Historical price data for one commodity by year range. Max range: 3 years.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `commodity_name` **(path)** | string | Commodity name from `/v2/mining/commodities/` |
| `start_year` | integer | Start year |
| `end_year` | integer | End year. Max span: 3 years |

---

### `GET /v2/mining/exports/`
Countries ranked by total export value for a given year and commodity.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `commodity_type` | string | `Gold`, `Copper`, `Coal` |
| `year` | integer | Year |

---

### `GET /v2/mining/global-commodity/`
Global commodity data including production, reserves, and trade. At least one param required.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `commodity_type` | string | `Coal`, `Gold`, `Nickel`, `Copper`, `Bauxite` |
| `country` | string | Country name |
| `limit` | integer | Limit results |

---

### `GET /v2/mining/companies/`
Search Indonesian mining companies.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `q` | string | Name, symbol, slug, or key operation substring search |
| `commodity_type` | string | Filter by commodity |
| `company_type` | string | Filter by company type |
| `has_financials` | boolean | Filter to companies with financial data only |

---

### `GET /v2/mining/companies/{slug}/`
Full operational detail for one mining company.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `slug` **(path)** | string | Company slug from `/v2/mining/companies/` |

---

### `GET /v2/mining/companies/financials/{slug}/`
Annual financial records for one mining company (USD millions).  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `slug` **(path)** | string | Company slug |
| `year` | integer | Financial year. Defaults to latest available |

---

### `GET /v2/mining/companies/ownership/{slug}/`
Corporate ownership tree (parents and subsidiaries with % stakes).  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `slug` **(path)** | string | Company slug |

---

### `GET /v2/mining/companies/performance/{slug}/`
Production volume, sales volume, strip ratio, and resources/reserves data.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `slug` **(path)** | string | Company slug |
| `year` | integer | Year. Defaults to latest available |

---

### `GET /v2/mining/sales-destination/{slug}/`
Sales destination breakdown by country for a mining company.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `slug` **(path)** | string | Company slug |
| `year` | integer | Year. Defaults to latest available |

---

### `GET /v2/mining/contracts/`
Active mining contracts linking mine owners to service contractors.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `owner` | string | Owner company slug |
| `contractor` | string | Contractor company slug |

---

### `GET /v2/mining/licenses/`
Mining licenses (IUP/IUPK) from the ESDM Minerba portal.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `status` | string | License status filter |
| `commodity_type` | string | E.g. `Coal`, `Nickel`, `Gold`, `Copper`, `Tin`, `Iron`, `Bauxite`, `Limestone` |
| `location` | string | Province/location filter |
| `expiry_before` | string | `YYYY-MM-DD` |
| `order_by` | string | Prefix `-` for descending. Default: `license_expiry_date` |
| `limit` | integer | Pagination |
| `offset` | integer | Pagination |

---

### `GET /v2/mining/license-auctions/`
Mining license auctions from the ESDM Minerba portal.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `commodity_type` | string | `Nickel`, `Coal`, `Gold`, `Copper` |
| `participant` | string | Company slug to find auctions where they participated |
| `qualified` | boolean | `true` = only auctions where participant passed pre-qualification |

---

### `GET /v2/mining/license-auctions/{wiup_code}/`
Full record for a single mining license auction including phases and participants.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `wiup_code` **(path)** | string | WIUP auction code |

---

### `GET /v2/mining/total-production/`
Total national production for a commodity across all years.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `commodity_type` | string | `Coal`, `Nickel`, `Gold`, `Copper` |

---

### `GET /v2/mining/resources-reserves/`
Discovery index of which provinces/years/commodities have reserves data.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| *(none)* | — | No query parameters accepted |

---

### `GET /v2/mining/resources-reserves/{province}/`
Resources and reserves data for one province, nested by year then commodity.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `province` **(path)** | string | Province name |
| `commodity_type` | string | `Coal`, `Gold`, `Silver`, `Copper`, `Nickel`, `Cobalt`, `Tin` |

---

### `GET /v2/mining/sites/`
Mining sites with filtering for location, commodity, and production volume.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `commodity_type` | string | `Coal`, `Gold`, `Nickel`, `Copper` |
| `location` | string | Province/location filter |
| `order_by` | string | Prefix `-` for descending, e.g. `-production_volume` |
| `limit` | integer | Pagination |
| `offset` | integer | Pagination |

---

### `GET /v2/mining/sites/{slug}/`
Full detail for one mining site including resources/reserves and coordinates.  
**Credits:** 1  
| Param | Type | Notes |
|---|---|---|
| `slug` **(path)** | string | Site slug from `/v2/mining/sites/` |

---

## Quick Credit Cost Reference

| Cost | Endpoints |
|---|---|
| **1** | `GET /v2/brokers/`, `/v2/broker-activity/{code}/`, `/v2/broker-summary/{symbol}/`, `/v2/foreign-flow/` (per page), `/v2/foreign-flow/{symbol}/`, `/v2/company/corporate-actions/{symbol}/`, `/v2/company/shareholders-composition/{symbol}/`, `/v2/subsectors/`, `/v2/industries/`, `/v2/subindustries/`, `/v2/tags/`, `/v2/companies/list_companies_with_segments/`, `/v2/company/get_quarterly_financial_dates/{symbol}/`, `/v2/companies/quarterly-financial-dates/` (per page), `/v2/listing-performance/{symbol}/`, `/v2/news/`, `/v2/filings/`, `/v2/suspensions/`, `/v2/close/` (per page), `/v2/daily/{symbol}/`, `/v2/idx-total/`, `/v2/index-daily/{code}/`, `/v2/index-daily/`, `/v2/klse/sectors/`, `/v2/klse/companies/`, `/v2/sgx/sectors/`, `/v2/sgx/subsectors/`, `/v2/sgx/tags/`, `/v2/sgx/news/`, `/v2/sgx/filings/`, `/v2/sgx/close/` (per page), `/v2/sgx/daily/{symbol}/`, `/v2/sgx/buybacks/`, `/v2/sgx/short-sell/`, all mining endpoints |
| **1 per section** | `/v2/company/report/{symbol}/` (8 sections max), `/v2/subsector/report/{sub_sector}/` (6 sections max), `/v2/klse/company/report/{symbol}/` (4 sections max), `/v2/sgx/company/report/{symbol}/` (4 sections max) |
| **1 per classification** | `/v2/klse/companies/top/`, `/v2/sgx/companies/top/`, `/v2/companies/top-changes/` |
| **1 per type** | `/v2/corporate-actions/` (7 types max) |
| **1 per page** | `/v2/free-float/` (per 100 companies), `/v2/companies/quarterly-financial-dates/` |
| **2** | `/v2/broker-activity/{code}/top/`, `/v2/broker-summary/{symbol}/top/`, `/v2/brokers/top/`, `/v2/most-traded/` |
| **3** | `GET /v2/companies/?q=` (NLQ), `GET /v2/sgx/companies/?q=` (NLQ) |
