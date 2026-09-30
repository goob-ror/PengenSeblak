"use client";
/**
 * EmitenDetail — dedicated per-emiten analytics page (`/emiten/$symbol`).
 *
 * The "Search emiten" flow previously dumped the searched ticker into the
 * Terminal Emiten peer list (where it stuck permanently). This page is the
 * right home for that click: full single-company analytics + watchlist star.
 *
 * DATA — every panel reuses hooks that are already credit-metered elsewhere:
 *   - useCompanyReport(symbol)  → /company/report/ (overview/valuation/
 *     financials/dividend/future, 6 credits/symbol, cached 24h)
 *   - useFreeFloatMap()         → shared 1-credit map
 *   - useRevenueSegments(symbol)→ lazy panel, 1 credit
 *   - useIdxNews(50)            → already on News page, shared cache
 *   - piotroskiFScore/altmanZScore — deterministic, free
 *   - useAnomalies()            → shared anomaly scan (already runs on page 1)
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Star, TrendingUp, Layers, Zap } from "lucide-react";
import { useCompanyReport, useFreeFloatMap, useRevenueSegments } from "@/hooks/useCompanyTerminal";
import { useIdxNews } from "@/hooks/useMarketOverview";
import { useAnomalies } from "@/hooks/useAnomalies";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { piotroskiFScore, altmanZScore, altmanZoneLabel } from "@/lib/algorithms/distress";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PageHeader, Tag, MethodTip, MetricStrip } from "@/components/terminal/primitives";

// ── Formatting helpers (local — keep this page self-contained) ─────────────
const fmtNum = (v: number | null | undefined, digits = 2, suffix = "") =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `${v.toLocaleString("en-US", { maximumFractionDigits: digits })}${suffix}`;

function fmtMarketCap(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e12) return `Rp ${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `Rp ${(v / 1e9).toFixed(1)}T`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toFixed(1)}M`;
  return `Rp ${v.toLocaleString("en-ID")}`;
}

function fmtIDR(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `Rp ${v.toLocaleString("en-ID")}`;
}

// ── Component ─────────────────────────────────────────────────────────────
export function EmitenDetail() {
  const { symbol } = useParams({ strict: false }) as { symbol?: string };
  const navigate = useNavigate();
  const ticker = (symbol ?? "").toUpperCase();
  const { has, add, remove } = useWatchlistStore();
  const inWatchlist = has(ticker);

  // ── Data hooks (all shared-cache, no new endpoints) ────────────────────
  const report = useCompanyReport(ticker || null);
  const freeFloat = useFreeFloatMap();
  const segments = useRevenueSegments(ticker || null);
  const anomalies = useAnomalies();
  const newsFeed = useIdxNews(50);

  // ── Derived analytics ──────────────────────────────────────────────────
  const piotroski = useMemo(() => {
    if (!report.data) return null;
    return piotroskiFScore(report.data as never);
  }, [report.data]);

  const altman = useMemo(() => {
    if (!report.data) return null;
    return altmanZScore(report.data as never);
  }, [report.data]);

  const overview = report.data?.overview ?? null;
  const valuation = report.data?.valuation ?? null;
  const financials = report.data?.financials ?? null;
  const dividend = report.data?.dividend ?? null;
  const future = report.data?.future ?? null;

  const companyAnomaly = useMemo(() => {
    const list = anomalies.data?.anomalies ?? [];
    return list.filter((a) => a.symbol === ticker);
  }, [anomalies.data, ticker]);

  const companyNews = useMemo(() => {
    const list = newsFeed.data ?? [];
    return list.filter((n) => (n.symbols ?? []).some((s) => s.replace(".JK", "") === ticker));
  }, [newsFeed.data, ticker]);

  const ff = freeFloat.data?.get(ticker) ?? null;

  // ── Historical valuation: PE band (year-keyed map) ──────────────────────
  const peHistory = useMemo(() => {
    const hv = valuation?.historical_valuation;
    if (!hv || typeof hv !== "object") return [] as Array<{ year: string; pe: number }>;
    const map = hv as Record<string, Record<string, unknown>>;
    return Object.entries(map)
      .filter(([y]) => /^\d{4}$/.test(y))
      .map(([year, row]) => ({ year, pe: Number(row?.["pe"]) || null }))
      .filter((x): x is { year: string; pe: number } => x.pe != null)
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [valuation?.historical_valuation]);

  return (
    <div className="space-y-4">
      {/* ── Header with back + watchlist star ── */}
      <PageHeader title={ticker || "Detail Emiten"} eyebrow={report.data?.company_name ?? ""}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void navigate({ to: "/sectors" })}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-border px-2.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Intelijen Sektor
          </button>
          <button
            onClick={() => (inWatchlist ? remove(ticker) : add(ticker))}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[10px] transition-colors",
              inWatchlist
                ? "border-warning/50 bg-warning/10 text-warning"
                : "border-border text-muted-foreground hover:border-warning/40 hover:text-warning",
            )}
            title={inWatchlist ? "Hapus dari Daftar Pantauan" : "Tambah ke Daftar Pantauan"}
          >
            <Star className={cn("size-3", inWatchlist && "fill-current")} />
            {inWatchlist ? "Dipantau" : "Pantau"}
          </button>
        </div>
      </PageHeader>

      {/* ── Metric strip: real overview values ── */}
      <MetricStrip
        items={[
          {
            label: "Harga",
            value: report.isPending ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              fmtIDR(overview?.last_close_price)
            ),
          },
          {
            label: "Market Cap",
            value: report.isPending ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              fmtMarketCap(overview?.market_cap)
            ),
          },
          {
            label: "P/E TTM",
            value: report.isPending ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              fmtNum(
                ((valuation?.historical_valuation as Record<string, Record<string, unknown>>)?.[
                  peHistory[peHistory.length - 1]?.year ?? ""
                ]?.["pe"] as number) ?? null,
                1,
                "x",
              )
            ),
          },
          {
            label: "EPS",
            value: report.isPending ? <Skeleton className="h-5 w-16" /> : fmtNum(financials?.eps),
          },
          {
            label: "Div Yield",
            value: report.isPending ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              fmtNum(dividend?.yield_ttm != null ? dividend.yield_ttm * 100 : null, 2, "%")
            ),
          },
          {
            label: "Valuasi (Pct)",
            value: report.isPending ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <span>
                {peHistory.length > 0
                  ? (() => {
                      const currentPe = peHistory[peHistory.length - 1]?.pe ?? 0;
                      const cheaper = peHistory.filter((p) => p.pe < currentPe).length;
                      const pct =
                        currentPe > 0 ? Math.round((cheaper / peHistory.length) * 100) : 0;
                      return pct <= 20 ? (
                        <span className="text-positive">P{pct} · Murah</span>
                      ) : pct >= 80 ? (
                        <span className="text-negative">P{pct} · Mahal</span>
                      ) : (
                        <span>P{pct} · Wajar</span>
                      );
                    })()
                  : "—"}
              </span>
            ),
          },
        ]}
      />

      {report.isError && (
        <div className="flex items-center gap-2 rounded border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
          Gagal memuat laporan emiten. Mungkin simbol tidak valid.
        </div>
      )}

      <div className="grid gap-4 2xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-4">
          {/* ── Piotroski + Altman ── */}
          <Panel title="Kesehatan & Distres" kicker="Piotroski F-Score · Altman Z-Score">
            <div className="grid gap-px bg-border md:grid-cols-2">
              <div className="bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Piotroski F-Score</span>
                  <MethodTip text="9 indikator kualitas fundamental: profitabilitas, arus kas, dan leverage. 7–9 kuat, 0–3 lemah." />
                </div>
                {report.isPending ? (
                  <Skeleton className="mt-2 h-8 w-24" />
                ) : piotroski ? (
                  <>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">
                      {piotroski.total}
                      <span className="text-sm text-muted-foreground">/9</span>
                    </div>
                    <div className="mt-2 flex gap-0.5">
                      {Array.from({ length: 9 }, (_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-1.5 flex-1 rounded-full",
                            i < piotroski.total ? "bg-positive" : "bg-secondary",
                          )}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Data tidak tersedia.</span>
                )}
              </div>
              <div className="bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Altman Z-Score</span>
                  <MethodTip text="Prediksi risiko kebangkrutan dari rasio keuangan. Z > 2.6 aman, 1.1–2.6 abu-abu, < 1.1 zona distres." />
                </div>
                {report.isPending ? (
                  <Skeleton className="mt-2 h-8 w-24" />
                ) : altman ? (
                  <>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">
                      {fmtNum(altman.score)}
                    </div>
                    <Tag
                      tone={
                        altman.zone === "safe"
                          ? "positive"
                          : altman.zone === "grey"
                            ? "warning"
                            : "negative"
                      }
                    >
                      {altmanZoneLabel(altman.zone)}
                    </Tag>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Data tidak tersedia.</span>
                )}
              </div>
            </div>
          </Panel>

          {/* ── Historical valuation PE band ── */}
          <Panel
            title="Valuasi Historis"
            kicker="P/E per tahun"
            action={
              <MethodTip text="P/E historis dari laporan valuasi emiten (year-keyed map). Bandingkan tahun-tahun untuk melihat apakah valuasi saat ini tinggi atau rendah secara historis." />
            }
          >
            {report.isPending ? (
              <Skeleton className="m-4 h-24" />
            ) : peHistory.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Data valuasi historis tidak tersedia.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {peHistory.map((x) => (
                  <div key={x.year} className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs text-muted-foreground">{x.year}</span>
                    <span className="text-xs font-medium tabular-nums">{x.pe.toFixed(1)}x</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ── Revenue segments (lazy) ── */}
          <Panel
            title="Segmen Pendapatan (HHI)"
            kicker="Konsentrasi bisnis"
            action={
              <MethodTip text="Breakdown pendapatan per segmen bisnis dari /company/get-segments/. HHI tinggi = pendapatan terkonsentrasi pada satu segmen." />
            }
          >
            {segments.isPending ? (
              <Skeleton className="m-4 h-24" />
            ) : segments.isError ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Segmen pendapatan tidak tersedia untuk emiten ini.
              </div>
            ) : (segments.data?.revenue_breakdown ?? []).length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Tidak ada data segmen.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(segments.data?.revenue_breakdown ?? [])
                  .slice()
                  .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
                  .slice(0, 8)
                  .map((s, i) => {
                    const total = (segments.data?.revenue_breakdown ?? []).reduce(
                      (acc, x) => acc + (x.value ?? 0),
                      0,
                    );
                    const pct = total > 0 ? ((s.value ?? 0) / total) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-2">
                        <span className="w-40 truncate text-xs">
                          {s.source || s.target || `Segmen ${i + 1}`}
                        </span>
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Right column: anomaly + news ── */}
        <div className="space-y-4">
          <Panel
            title="Anomali Pasar"
            kicker="Deteksi Z-score terhadap peer"
            action={
              <MethodTip text="Anomali divergensi terdeteksi oleh Monitor Anomali Pasar (9 sub-sektor) — sama dengan panel Ringkasan Pasar." />
            }
          >
            {anomalies.isPending ? (
              <Skeleton className="m-4 h-16" />
            ) : companyAnomaly.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Tidak ada anomali terdeteksi (atau sub-sektor belum dipindai).
              </div>
            ) : (
              <div className="divide-y divide-border">
                {companyAnomaly.map((a) => (
                  <div key={a.symbol + a.type} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">{a.label}</span>
                      <Tag tone={a.severity === "High" ? "negative" : "warning"}>{a.severity}</Tag>
                    </div>
                    <div className="mt-1.5 text-[10px] text-muted-foreground">
                      {a.metric} · emiten {a.value} vs peer {a.average} (deviasi{" "}
                      {fmtNum(a.deviation)})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ── Related news ── */}
          <Panel
            title="Berita Terkait"
            kicker={companyNews.length > 0 ? `${companyNews.length} berita` : "IDX news feed"}
            action={
              <MethodTip text="Berita IDX yang menyebut ticker ini — disaring dari feed berita real yang sudah dimuat." />
            }
          >
            {newsFeed.isPending ? (
              <Skeleton className="m-4 h-16" />
            ) : companyNews.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Tidak ada berita yang menyebut emiten ini dalam 50 berita terbaru.
              </div>
            ) : (
              <div className="max-h-100 overflow-y-auto divide-y divide-border">
                {companyNews.slice(0, 10).map((n, i) => (
                  <a
                    key={`${n.timestamp}-${i}`}
                    href={n.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-3 hover:bg-secondary/50"
                  >
                    <div className="text-xs leading-5">{n.title}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {n.source ?? "IDX"} ·{" "}
                      {new Date(n.timestamp).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
