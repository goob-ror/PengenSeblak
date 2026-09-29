# PengenSeblak — Indonesian Market Terminal

A high-density, credit-aware market intelligence terminal for the **Indonesian Stock Exchange (IDX)**, built on the [Sectors REST API v2](https://docs.sectors.app/get-started/v2/overview). It turns raw market data into **derived, explainable insights** — sector health scores, anomaly detection, financial distress models, and a rule-based decision screener.

> **Bahasa Indonesia** is the primary UI language, with standard English financial terms (P/E, ROE, free float, …) preserved where they aid professional use.

---

## What it does

Every analytical number in the app is **computed from live API data** — no mock data in any user-facing page. Derived scores are always accompanied by a tooltip explaining how they are calculated, so nothing is a black box.

### Ringkasan Pasar — Market Overview
- IHSG price chart with 1W/1M/3M range filter, market-cap, and foreign-flow panels.
- **Net Foreign Flow** bar chart (daily buy/sell) from `/foreign-flow/IHSG/`.
- **Monitor Anomali Pasar** — scrollable live anomaly list from Z-score divergence detection.
- **Katalis Pasar Terbaru** — real IDX news feed, clickable into a full detail sheet.
- **Macro Pulse** — USD/IDR trend, market-cap, top movers, foreign volume.
- **Radar Rebalancing LQ45** — predicts inclusion/exclusion candidates at the next LQ45 review (seasonal: active Dec–Feb and Jun–Aug, with an off-season "load anyway" option).

### Intelijen Sektor — Sector Intelligence
- **Sector Health Index (SHI)** 0–100 with an explainable "why this score" breakdown (Pertumbuhan / Stabilitas / Valuasi / Momentum) from real subsector report inputs.
- Sector selector across verified sub-sectors; per-sector universe of emitens with price, P/E, ROE, DER, margin, market cap.
- **Pertumbuhan Historis** — revenue/earnings growth history with 3Y/5Y/8Y range filter.
- **Divergensi Sektor** — Z-score anomalies within the selected sub-sector.

### Terminal Emiten — Company & Peer Terminal
- Peer comparison of 2–5 emitens (search across top-50 IDX names by market cap, persisted to localStorage).
- **Matriks Komparasi** — fundamentals from live company reports.
- **Dominance Score** — head-to-head market-leader matrix from a weighted fundamental composite.
- **Kesehatan & Distres** — **Piotroski F-Score** (0–9) and **Altman Z-Score** (incl. bank branch) with plain-language hover tooltips for every input metric.
- Revenue-segment breakdown (HHI concentration) per selected peer.
- Free float map.

### Halaman Detail Emiten — `/emiten/{symbol}`
- Dedicated per-company analytics page (opened from global search, sector tables, or anomaly sheets).
- Metric strip (price, market cap, P/E, EPS, dividend yield, free float), Piotroski + Altman, historical P/E band, revenue segments, related anomalies, and news mentioning the ticker.
- **Watchlist star** — add/remove to the persisted watchlist straight from the page.

### Berita & Katalis — News Intelligence
- Real IDX news feed (50 latest articles) with search, sector/tag filters, and sentiment classification (Positive/Neutral/Negative derived from tags).
- **Indeks Ketakutan (Fear Index)** — rolling 20-session stdev of IHSG daily returns, with real news-sentiment distribution as proof factors.
- Sector and tag distribution sidebars (click-to-filter).
- Full news detail sheet with body, symbols, and source link.

### Screener Keputusan — Decision Screener
- Real screener rows (from the shared anomaly-scan queries — **zero extra API credits**), filtered by quality threshold, ROE minimum, classification, and flag toggles.
- **Deterministic decision labels**: *Undervalued Quality*, *Growth at Reasonable Price*, *Dividend Trap Alert*, *Balanced Fundamentals*.
- Multi-factor decision matrix, sortable columns, watchlist toggle per row.

### Daftar Pantauan — Watchlist
- Persisted (localStorage) watchlist with live price/change/P/E/ROE and anomaly tags.
- Research notes per emiten and price alerts (above/below thresholds).

### Metodologi — Methodology
- Full in-app documentation of every algorithm (SHI, Piotroski, Altman, Dominance, Divergence) and its data sources.

---

## Architecture

```
Browser (React 19 + Vite, port 8080)
  └── TanStack Query (client cache) ──► Express proxy (port 3001)
                                          ├── JWT auth (bcrypt + jsonwebtoken)
                                          ├── Rate limiting (express-rate-limit + Redis)
                                          ├── Endpoint registry + local validation
                                          ├── 6-layer credit defense (see below)
                                          └── Sectors API v2 (api.sectors.app)
```

**Client:** React 19 · TanStack Start/Router · TanStack Query · Recharts · Tailwind CSS 4 + shadcn/ui (Radix) · Zustand · Zod · Lucide icons

**Server:** Express 5 · ioredis · mysql2 · node-cron · helmet · morgan · @ngrok/ngrok

### Credit defense (6 layers)

The Sectors API charges per request, so the server stack is built to avoid wasted calls:

1. **Redis + file cache with per-endpoint TTL** (fundamentals 24h, sector reports 6h, prices 15m, news 5m, static lists 7d).
2. **TanStack Query client cache** — no refetch while data is fresh; query keys shared across pages so one fetch feeds every consumer.
3. **In-flight request dedup** — identical concurrent requests share one upstream call.
4. **Sections selector** — company reports request only needed sections (6 credits/symbol instead of 8).
5. **Cache-aware prefetch** on startup in development; morning warm-up cron before market open.
6. **Endpoint registry with local validation** — malformed requests are rejected before reaching the paid API.

---

## Getting started

### Prerequisites
- Node.js 18+
- MySQL and Redis (Redis optional — in-memory fallback for single instance)
- A [Sectors API](https://sectors.app) key

### Setup

```bash
git clone <repo> && cd PengenSeblak
npm install
cd server && npm install && cd ..
cp .example.env .env          # fill in the values (see below)
```

Create the database schema:

```bash
mysql -u <user> -p pengen_seblak < pengen_seblak.sql
```

### Environment variables (`.env`)

| Key | Purpose |
|---|---|
| `PORT` | Express port (default 3001) |
| `SECTORS_API_KEY` | Your Sectors API key — **required** |
| `SECTORS_API_BASE_URL` | Upstream base (default `https://api.sectors.app/v2`) |
| `DB_*` | MySQL connection (host/port/user/password/name) |
| `REDIS_URL` | Optional Redis; falls back to in-memory cache |
| `JWT_SECRET`, `COOKIE_SECRET` | Long random strings — **required in production** |
| `CLIENT_ORIGIN` | Comma-separated allowed browser origins |
| `NGROK_AUTHTOKEN`, `NGROK_URL` | Optional public tunnel config |
| `VITE_API_URL` | Leave **empty** in dev (Vite proxies `/api` to Express) |

### Run

```bash
npm run dev          # Vite (:8080) + Express (:3001) + ngrok tunnel, concurrently
npm run dev:server   # server only
npm run build        # production client build
```

Then open http://localhost:8080 and register an account.

---

## Project layout

```
src/
  components/terminal/   # page components (pages.tsx, charts, primitives, EmitenDetail)
  components/auth/       # login page
  hooks/                 # data hooks — one per API concern, credit-aware
  lib/algorithms/        # SHI, Piotroski, Altman, Dominance, Divergence, terminal metrics
  lib/                   # api client, query config (stale times), utils
  stores/                # Zustand: auth, watchlist
  routes/                # TanStack Router file routes
server/
  src/                   # Express app, adapters, endpoint registry, ngrok, prefetch
  migrations/            # SQL migrations
pengen_seblak.sql        # full database schema
```

---

## Notes

- **No automated trading** — this is decision support only.
- **No fabricated data** — where an API field is missing, the UI shows "—" and says so, rather than inventing a number.
- Not officially affiliated with IDX or Sectors.app.
