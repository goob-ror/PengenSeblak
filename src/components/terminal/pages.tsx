"use client";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  Activity,
  ArrowDownUp,
  Bell,
  BellOff,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Database,
  Filter,
  Info,
  Layers,
  Plus,
  RefreshCw,
  Scale,
  Search,
  MousePointerClick,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  StarOff,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Bar,
  Change,
  ExportMenu,
  InsightLabel,
  MethodTip,
  MetricStrip,
  PageHeader,
  Panel,
  Score,
  Tag,
  td,
  th,
} from "./primitives";
import { IHSGChart, SectorChart, ForeignFlowChart, GrowthHistoryChart } from "./charts";
import {
  useIHSGSeries,
  useIdxTotal,
  useForeignFlow,
  useTopChanges,
  useIdxNews,
  type NewsArticle,
} from "@/hooks/useMarketOverview";
import { useSectorHealthScores, useSubsectorReportDetail } from "@/hooks/useSubsectorReport";
import {
  useSubsectorList,
  useSectorUniverse,
  useSectorGrowthHistory,
  isSubsectorVerified,
} from "@/hooks/useSectorUniverse";
import { useAnomalies } from "@/hooks/useAnomalies";
import { useJakartaClock, idxSession } from "@/hooks/useJakartaClock";
import type { AnomalyResult } from "@/lib/algorithms/divergence";
import {
  anomalies,
  classify,
  companies,
  formatIDR,
  healthLabel,
  methodology,
  news,
  sectorHealth,
  sectors,
  type Company,
  type Tone,
} from "@/lib/market-data";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { cn } from "@/lib/utils";
import {
  useCompanyReports,
  useFreeFloatMap,
  useTopCompanies,
  useRevenueSegments,
  useEsgScores,
  toCompanyFinancialsInput,
  type CompanyReportRaw,
} from "@/hooks/useCompanyTerminal";
import {
  piotroskiFScore,
  altmanZScore,
  altmanZoneLabel,
  type CompanyFinancialsInput,
} from "@/lib/algorithms/distress";
import {
  classifyFreeFloat,
  classifyEsg,
  esgTone,
  floatTone,
  valuationPercentile,
  analystExpectationGap,
  revenueConcentration,
  dominanceScore,
  type DominanceInput,
} from "@/lib/algorithms/terminal-metrics";

// ── Small helpers ─────────────────────────────────────────────────────────────
const toneFor = (v: number): Tone => (v > 0 ? "positive" : v < 0 ? "negative" : "neutral");

/** Decimal (already-scaled) → percent text. `signed` forces an explicit +/-. */
const fmtPct = (v: number | null | undefined, signed = false): string => {
  if (v == null || !Number.isFinite(v)) return "—";
  const pct = v * 100;
  const s = `${pct >= 0 && signed ? "+" : ""}${pct.toFixed(1)}%`;
  return s;
};
const meta = (label: string, value: string) => (
  <div>
    <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    <div className="mt-1 text-xs text-foreground">{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. MARKET OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

// ── Skeleton primitive ────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-secondary/60", className)} />;
}

/**
 * Compact signed IDR for flow values (e.g. net foreign inflow).
 * Always signed, always scaled — these numbers are ~1e11-1e12 so raw digits
 * are unreadable. Uses the same "Rp." + grouped-thousands convention as the
 * market-cap figure the user specified, with an explicit sign for direction.
 */
function formatIDRCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "+";
  const abs = Math.abs(v);
  const g = (n: number, d = 2) =>
    n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (abs >= 1e12) return `${sign}Rp. ${g(abs / 1e12)} T`;
  if (abs >= 1e9) return `${sign}Rp. ${g(abs / 1e9)} M`;
  if (abs >= 1e6) return `${sign}Rp. ${g(abs / 1e6)} Jt`;
  return `${sign}Rp. ${g(abs, 0)}`;
}

/** Market-cap values are magnitudes, so do not add a misleading +/- sign. */
function formatMarketCap(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const g = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1e12) return `Rp. ${g(v / 1e12)} T`;
  if (abs >= 1e9) return `Rp. ${g(v / 1e9)} B`;
  return `Rp. ${g(v / 1e6)} Jt`;
}

/**
 * Tooltip text for each SHI component pill: name, score / max, weight, and
 * any missing inputs. All values come from the existing SHIEntry — zero API.
 */
function shiComponentTip(
  name: string,
  score: number,
  weightPct: number,
  entry: { missing: string[]; complete: boolean },
): string {
  const max = 25;
  const pct = Math.round((score / max) * 100);
  const parts = [name, `${score.toFixed(1)} / ${max} (${pct}%)`, `Bobot ${weightPct}%`];
  if (!entry.complete) {
    parts.push(
      entry.missing.length > 0 ? `Data parsial: ${entry.missing.join(", ")}` : "Data parsial",
    );
  }
  return parts.join(" · ");
}

export function MarketOverview() {
  const [period, setPeriod] = useState<"1W" | "1M" | "3M">("1M");
  const [detail, setDetail] = useState<AnomalyResult | null>(null);

  // ── Lapis 2: TanStack Query (in-memory client cache) ──────────────────────
  const days = period === "1W" ? 7 : period === "1M" ? 30 : 90;
  const ihsg = useIHSGSeries(days); // 1W=7, 1M=30, 3M=90 (API max range = 90 days)
  const idxTotal = useIdxTotal(30);
  const foreignFl = useForeignFlow(30);
  const topMov = useTopChanges();
  const shi = useSectorHealthScores();
  const anom = useAnomalies();
  const newsFeed = useIdxNews(8);
  const [newsDetail, setNewsDetail] = useState<NewsArticle | null>(null);

  // ── Derived values from live data ─────────────────────────────────────────

  // Slice the 30-day series to the selected period.
  // NOTE: index-daily is DAILY-only ({ date, close }) — the Sectors API has no
  // intraday/hourly endpoint, so a true hourly 1D chart is NOT possible. We show
  // 1W / 1M / 3M session views instead of faking intraday resolution.
  const periodPoints = period === "1W" ? 7 : period === "1M" ? 30 : 90;
  const ihsgChartData = useMemo(() => {
    const full = ihsg.data ?? [];
    return full.length > periodPoints ? full.slice(-periodPoints) : full;
  }, [ihsg.data, periodPoints]);

  const latestIHSG = ihsgChartData.at(-1);
  const prevIHSG = ihsgChartData.at(-2);
  const ihsgLevel = latestIHSG?.value ?? null;
  const ihsgChange =
    ihsgLevel && prevIHSG?.value ? ((ihsgLevel - prevIHSG.value) / prevIHSG.value) * 100 : null;

  // Market cap — Indonesian units (Triliun / Miliar)
  // Requested format: "Rp. xx,xxx.xx T" — grouped thousands, 2 decimals.
  // NOTE intentional difference from the rest of the app (which uses id-ID
  // grouping, "11.234,56"): the user asked for comma-grouped thousands with
  // a dot decimal here, so we format with en-US grouping + "Rp." prefix.
  const mcapFormatted = (() => {
    const v = idxTotal.data?.mcap;
    if (v == null) return null;

    const abs = Math.abs(v);

    const g = (n: number) =>
      n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    if (abs >= 1e12) return `Rp. ${g(v / 1e12)} T`;
    if (abs >= 1e9) return `Rp. ${g(v / 1e9)} M`;
    if (abs >= 1e6) return `Rp. ${g(v / 1e6)} Jt`;

    return `Rp. ${Math.round(v).toLocaleString("en-US")}`;
  })();

  // Foreign flow — smart format: show in Miliar (M) or Triliun (T) IDR
  const ffRaw = foreignFl.data?.latest ?? null;
  const ffPositive = (ffRaw ?? 0) >= 0;
  const ffFormatted = (() => {
    if (ffRaw == null) return null;
    const abs = Math.abs(ffRaw);
    const sign = ffRaw >= 0 ? "+" : "-";
    // ≥ 1 Triliun → Triliun, else Miliar
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
    return `${sign}${(abs / 1e9).toFixed(0)}M`;
  })();

  // ── Real Jakarta wall clock (replaces hardcoded +7h offset) ──────────
  const clock = useJakartaClock();
  const session = idxSession(clock);
  const marketOpen = session.isOpen;

  // Last updated label — value date + time
  const updatedAt = latestIHSG ? `${latestIHSG.t}${marketOpen ? "" : " · sesi tutup"}` : "Memuat…";

  // SHI list — LIVE ONLY. No mock fallback (user directive: no dummy data
  // anywhere on Ringkasan Pasar). When the API hasn't answered yet the list
  // is simply empty and the panels show their own loading/empty state.
  const shiList = [...shi.results].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      <PageHeader title="Ringkasan Pasar">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {(ihsg.isFetching || shi.isLoading) && (
            <RefreshCw className="size-3 animate-spin text-primary" />
          )}
          <span className="tabular-nums">{clock.dateLabel}</span>
          <span className="tabular-nums font-medium text-foreground">{clock.timeHHMM}</span>
          <span className="text-muted-foreground/60">WIB</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{updatedAt}</span>
        </div>
        <ExportMenu title="Market Overview" />
      </PageHeader>

      {/* ── Metric Strip ─────────────────────────────────────────────────── */}
      <MetricStrip
        items={[
          {
            label: "IHSG",
            value: ihsg.isPending ? (
              <Skeleton className="h-5 w-20" />
            ) : ihsgLevel != null ? (
              ihsgLevel.toLocaleString("id-ID", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            ) : (
              "—"
            ),
            sub:
              ihsgChange != null ? (
                <Change value={ihsgChange} />
              ) : ihsg.isPending ? (
                <Skeleton className="h-3 w-12" />
              ) : (
                "—"
              ),
          },
          {
            label: "Market status",
            value: marketOpen ? (
              <span className="text-positive">BUKA</span>
            ) : (
              <span className="text-muted-foreground">TUTUP</span>
            ),
            sub: <span className="tabular-nums">{session.label}</span>,
          },
          {
            label: "Mkt Cap IDX",
            value: idxTotal.isPending ? <Skeleton className="h-5 w-20" /> : (mcapFormatted ?? "—"),
            sub:
              idxTotal.data?.change != null ? (
                <Change value={idxTotal.data.change} />
              ) : idxTotal.isPending ? (
                <Skeleton className="h-3 w-14" />
              ) : (
                "—"
              ),
          },
          {
            label: "Vol Asing (sesi)",
            value: foreignFl.isPending ? (
              <Skeleton className="h-5 w-20" />
            ) : ffFormatted != null ? (
              <span className={ffPositive ? "text-positive" : "text-negative"}>{ffFormatted}</span>
            ) : (
              "—"
            ),
            sub: foreignFl.isPending ? (
              <Skeleton className="h-3 w-16" />
            ) : ffFormatted != null ? (
              <span className={ffPositive ? "text-positive" : "text-negative"}>
                {ffPositive ? "Net beli asing" : "Net jual asing"}
              </span>
            ) : foreignFl.isError ? (
              "Gagal memuat"
            ) : (
              "—"
            ),
          },
          {
            label: "Top Gainer",
            value: topMov.isPending ? (
              <Skeleton className="h-5 w-14" />
            ) : (
              (topMov.data?.gainers[0]?.symbol ?? "—")
            ),
            sub: topMov.data?.gainers[0] ? (
              <Change value={topMov.data.gainers[0].price_change_pct * 100} />
            ) : topMov.isPending ? (
              <Skeleton className="h-3 w-12" />
            ) : (
              "—"
            ),
          },
          {
            label: "Top Loser",
            value: topMov.isPending ? (
              <Skeleton className="h-5 w-14" />
            ) : (
              (topMov.data?.losers[0]?.symbol ?? "—")
            ),
            sub: topMov.data?.losers[0] ? (
              <Change value={topMov.data.losers[0].price_change_pct * 100} />
            ) : topMov.isPending ? (
              <Skeleton className="h-3 w-12" />
            ) : (
              "—"
            ),
          },
        ]}
      />
      {/* ── IHSG Chart + Sector Heatmap ──────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Panel
          title="IHSG"
          kicker="Data live Sectors API"
          action={
            <div className="flex items-center gap-2">
              {ihsg.isFetching && (
                <RefreshCw className="size-3 animate-spin text-muted-foreground" />
              )}
              <div className="flex">
                {(["1W", "1M", "3M"] as const).map((x) => (
                  <Button
                    key={x}
                    variant={period === x ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPeriod(x)}
                    className="h-7 px-2 text-[10px]"
                  >
                    {x}
                  </Button>
                ))}
              </div>
            </div>
          }
        >
          {ihsg.isPending ? (
            <div className="flex h-72 items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <RefreshCw className="size-5 animate-spin" />
                <span className="text-[10px] uppercase tracking-wider">Memuat data IHSG…</span>
              </div>
            </div>
          ) : ihsg.isError ? (
            <div className="flex h-72 items-center justify-center">
              <div className="text-center text-xs text-muted-foreground">
                <span className="text-negative">Gagal memuat data IHSG.</span>
                <br />
                Periksa koneksi atau kuota API.
              </div>
            </div>
          ) : (
            <IHSGChart data={ihsgChartData} />
          )}
          <div className="flex gap-5 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span>
              <i className="mr-1 inline-block size-1.5 bg-primary" />
              IHSG
            </span>
            {ihsgLevel && (
              <span className="tabular-nums">
                {ihsgLevel.toLocaleString("id-ID", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            )}
            {ihsgChange != null && (
              <span className={ihsgChange >= 0 ? "text-positive" : "text-negative"}>
                {ihsgChange >= 0 ? "+" : ""}
                {ihsgChange.toFixed(2)}%
              </span>
            )}
            <span className="ml-auto tabular-nums">
              {ihsgChartData.length
                ? `${ihsgChartData[0]?.t} → ${ihsgChartData.at(-1)?.t} · ${period} · ${ihsgChartData.length} sesi`
                : "—"}
            </span>
          </div>
        </Panel>

        {/* Sector heatmap — uses SHI scores from live data */}
        <Panel title="Heatmap Sektor" kicker="Skor SHI (bukan % perubahan)">
          <div className="divide-y divide-border">
            {shi.isLoading
              ? Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[28px_72px_1fr_64px] items-center gap-3 px-4 py-2.5"
                  >
                    <Skeleton className="h-3 w-5" />
                    <Skeleton className="h-3 w-14" />
                    <div>
                      <Skeleton className="mb-1.5 h-3 w-24" />
                      <Skeleton className="h-1 w-full" />
                    </div>
                    <Skeleton className="ml-auto h-3 w-10" />
                  </div>
                ))
              : shiList.map((s, i) => {
                  // Use live SHI score to derive a relative performance indicator
                  // (actual % change requires the daily per-index endpoint — not fetched yet)
                  const perfProxy = ((s.score - 65) / 35) * 3; // map 0-100 score → approx % range
                  const isPos = perfProxy >= 0;
                  const barWidth = Math.min(100, Math.abs(perfProxy) * 25);
                  return (
                    <div
                      key={s.name}
                      className="grid grid-cols-[28px_72px_1fr_64px] items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors"
                      title={`SHI: ${s.score}`}
                    >
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">{s.code}</span>
                      <div className="min-w-0">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs font-medium truncate">{s.name}</span>
                          <span className="ml-2 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                            {isPos ? "+" : ""}
                            {perfProxy.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isPos ? "bg-positive/70" : "bg-negative/60",
                            )}
                            style={{ width: `${Math.max(3, barWidth)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={cn(
                            "text-xs font-medium tabular-nums",
                            s.score >= 65
                              ? "text-positive"
                              : s.score >= 50
                                ? "text-warning"
                                : "text-negative",
                          )}
                        >
                          {s.score}
                        </span>
                      </div>
                    </div>
                  );
                })}
          </div>
        </Panel>
      </div>

      {/* ── SHI + Aliran Dana Asing (row 2) ─────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Sector Health Index"
          kicker={
            shi.results.some((s) => s.isLive) ? "Live dari Sectors API" : "Skor turunan kustom"
          }
          action={
            <div className="flex items-center gap-2">
              {shi.isLoading && <RefreshCw className="size-3 animate-spin text-muted-foreground" />}
              <MethodTip text="SHI menimbang pertumbuhan (40%), stabilitas margin (35%), dan kondisi utang (25%) dari laporan subsector Sectors API. Data live di-cache 6 jam." />
            </div>
          }
        >
          <div className="divide-y divide-border">
            {shiList.slice(0, 6).map((s, i) => {
              const tone = toneFor(s.score - 64);
              const barColor =
                tone === "positive"
                  ? "bg-positive"
                  : tone === "accent"
                    ? "bg-primary"
                    : tone === "warning"
                      ? "bg-warning"
                      : "bg-negative";
              const scoreColor =
                tone === "positive"
                  ? "text-positive"
                  : tone === "accent"
                    ? "text-primary"
                    : tone === "warning"
                      ? "text-warning"
                      : "text-negative";
              return (
                <div
                  key={s.name}
                  className="grid grid-cols-[28px_1fr_56px_auto] items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
                >
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium truncate">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2 shrink-0 flex items-center gap-1">
                        {s.trend}
                        {s.isLive && (
                          <span
                            className="inline-block size-1.5 rounded-full bg-positive"
                            title="Live"
                          />
                        )}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", barColor)}
                        style={{ width: `${s.score}%` }}
                      />
                    </div>
                    <div className="flex gap-2 mt-1.5 text-[9px] text-muted-foreground">
                      <span
                        title={shiComponentTip("Pertumbuhan (Growth)", s.growth, 30, s)}
                        className="cursor-help tabular-nums hover:text-foreground transition-colors"
                      >
                        G {Math.round(s.growth)}
                      </span>
                      <span
                        title={shiComponentTip("Stabilitas (Stability)", s.stability, 25, s)}
                        className="cursor-help tabular-nums hover:text-foreground transition-colors"
                      >
                        S {Math.round(s.stability)}
                      </span>
                      <span
                        title={shiComponentTip("Valuasi (Valuation)", s.valuation, 25, s)}
                        className="cursor-help tabular-nums hover:text-foreground transition-colors"
                      >
                        V {Math.round(s.valuation)}
                      </span>
                      <span
                        title={shiComponentTip("Momentum", s.momentum, 20, s)}
                        className="cursor-help tabular-nums hover:text-foreground transition-colors"
                      >
                        M {Math.round(s.momentum)}
                      </span>
                    </div>
                  </div>
                  <div className="text-center">
                    {shi.isLoading ? (
                      <Skeleton className="mx-auto h-6 w-8" />
                    ) : (
                      <span className={cn("text-xl font-semibold tabular-nums", scoreColor)}>
                        {s.score}
                      </span>
                    )}
                  </div>
                  <Tag tone={tone}>{healthLabel(s.score)}</Tag>
                </div>
              );
            })}
          </div>
          {shi.isError && (
            <div className="border-t border-border bg-secondary/30 px-4 py-2.5 flex items-start gap-2.5">
              <Database className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
              <div className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Data Tidak Tersedia
                </span>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/70">
                  Skor SHI tidak dapat dimuat dari Sectors API. Coba lagi nanti.
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <span className="text-[10px] text-muted-foreground">
              Data live Sectors API · di-cache 6 jam · hover G/S/V/M untuk detail
            </span>
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {shiList.filter((s) => s.isLive).length}/{shiList.length} sektor live
            </span>
          </div>
        </Panel>

        {/* ── Net Foreign Flow MTD Kumulatif (plan item #2, Kritikal) ───────
            Zero extra credits: useForeignFlow already returns mtdFlow and
            last5sum, they just were never rendered before. */}
        <Panel
          title="Aliran Dana Asing"
          kicker="Net Foreign Flow · kumulatif"
          action={
            <MethodTip text="Akumulasi net foreign inflow IHSG: Month-to-Date (sejak awal bulan) dan 5 sesi terakhir. Data foreign-flow Sectors API, di-cache." />
          }
        >
          {foreignFl.isPending ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : foreignFl.isError ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Gagal memuat data aliran dana asing.
            </div>
          ) : (
            <>
              {/* Bar chart with grid — 20 sessions, top of panel */}
              <ForeignFlowChart data={(foreignFl.data?.series ?? []).slice(-20)} />
              {/* Summary stats below chart */}
              <div className="grid grid-cols-3 divide-x divide-border border-t">
                <div className="px-4 py-3">
                  <div className="text-[10px] text-muted-foreground">MTD</div>
                  <div
                    className={cn(
                      "mt-1 text-sm font-semibold tabular-nums",
                      foreignFl.data?.mtdPositive ? "text-positive" : "text-negative",
                    )}
                  >
                    {formatIDRCompact(foreignFl.data?.mtdFlow ?? null)}
                  </div>
                  <div className="mt-0.5 text-[9px] text-muted-foreground">
                    {foreignFl.data?.mtdPositive ? "Net masuk" : "Net keluar"}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] text-muted-foreground">5 Sesi</div>
                  <div
                    className={cn(
                      "mt-1 text-sm font-semibold tabular-nums",
                      foreignFl.data?.last5Positive ? "text-positive" : "text-negative",
                    )}
                  >
                    {formatIDRCompact(foreignFl.data?.last5sum ?? null)}
                  </div>
                  <div className="mt-0.5 text-[9px] text-muted-foreground">
                    {foreignFl.data?.last5Positive ? "Net masuk" : "Net keluar"}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] text-muted-foreground">Sesi Terakhir</div>
                  <div
                    className={cn(
                      "mt-1 text-sm font-semibold tabular-nums",
                      (foreignFl.data?.latest ?? 0) >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {formatIDRCompact(foreignFl.data?.latest ?? null)}
                  </div>
                  <div className="mt-0.5 text-[9px] text-muted-foreground">
                    {(foreignFl.data?.latest ?? 0) >= 0 ? "Net beli" : "Net jual"}
                  </div>
                </div>
              </div>
              {/* ── Katalis: real IDX news feed (scrollable, same card) ──
                        Same pattern as the Anomali list: click → Sheet detail. */}
              <div className="border-t border-border">
                <div className="flex items-center justify-between px-4 pt-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Katalis Pasar Terbaru
                  </span>
                  {newsFeed.isFetching ? (
                    <RefreshCw className="size-3 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      Sectors API · {newsFeed.data?.length ?? 0} berita
                    </span>
                  )}
                </div>
                {newsFeed.isPending ? (
                  <div className="max-h-36 space-y-2 overflow-y-auto p-3">
                    {Array.from({ length: 4 }, (_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : newsFeed.isError ? (
                  <div className="px-4 py-3 text-[10px] text-muted-foreground">
                    Berita tidak dapat dimuat.
                  </div>
                ) : (newsFeed.data ?? []).length === 0 ? (
                  <div className="px-4 py-3 text-[10px] text-muted-foreground">
                    Tidak ada berita terbaru.
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto">
                    <div className="divide-y divide-border">
                      {(newsFeed.data ?? []).map((n, i) => (
                        <button
                          key={`${n.timestamp}-${i}`}
                          onClick={() => setNewsDetail(n)}
                          className="flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-secondary/50"
                        >
                          <span className="mt-0.5 shrink-0 text-[9px] tabular-nums text-muted-foreground">
                            {n.timestamp?.slice(11, 16)}
                          </span>
                          <span className="line-clamp-2 text-[11px] leading-snug text-foreground">
                            {n.title}
                          </span>
                          {(n.symbols ?? []).length > 0 && (
                            <span className="ml-auto shrink-0 text-[9px] font-semibold text-primary">
                              {n.symbols!.join(",")}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="px-4 pb-2 pt-1">
                  <span className="text-[9px] text-muted-foreground">
                    Klik berita untuk detail katalis
                  </span>
                </div>
              </div>
            </>
          )}
        </Panel>

        {/* Top Movers panel (live) + Anomali (live Z-score detection) */}
        <Panel
          title="Top Movers Hari Ini"
          kicker="Live Sectors API"
          action={
            topMov.isFetching ? (
              <RefreshCw className="size-3 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-[10px] text-muted-foreground">1D</span>
            )
          }
        >
          {topMov.isPending ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          ) : topMov.isError ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Gagal memuat top movers.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Gainers */}
              <div className="px-4 py-1.5 text-[9px] uppercase tracking-wider text-positive/70">
                Top Naik
              </div>
              {(topMov.data?.gainers ?? []).map((g) => (
                <div
                  key={g.symbol}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-secondary/50"
                >
                  <span className="w-14 text-xs font-semibold text-primary">{g.symbol}</span>
                  <span className="flex-1 truncate text-[10px] text-muted-foreground">
                    {g.company_name}
                  </span>
                  <Change value={g.price_change_pct * 100} />
                </div>
              ))}
              {/* Losers */}
              <div className="px-4 py-1.5 text-[9px] uppercase tracking-wider text-negative/70">
                Top Turun
              </div>
              {(topMov.data?.losers ?? []).map((l) => (
                <div
                  key={l.symbol}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-secondary/50"
                >
                  <span className="w-14 text-xs font-semibold text-primary">{l.symbol}</span>
                  <span className="flex-1 truncate text-[10px] text-muted-foreground">
                    {l.company_name}
                  </span>
                  <Change value={l.price_change_pct * 100} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Anomaly monitor — REAL Z-score detection from the Companies Screener.
          Rules: Features To Be Implemented.md Algoritma 5. No mock data. */}
        <Panel
          title="Monitor Anomali Pasar"
          kicker={
            anom.isPending ? "Memuat…" : anom.isError ? "Gagal memuat" : "Deteksi live Sectors API"
          }
          action={
            anom.isPending ? (
              <RefreshCw className="size-3 animate-spin text-muted-foreground" />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-negative/30 bg-negative/10 px-2 py-0.5 text-[10px] font-medium text-negative">
                {(anom.data ?? []).length} terdeteksi
              </span>
            )
          }
        >
          {anom.isPending ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-9 w-12" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-10" />
                </div>
              ))}
            </div>
          ) : anom.isError ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Gagal memuat anomali. Endpoint screener mungkin tidak tersedia.
            </div>
          ) : (anom.data ?? []).length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="text-xs text-muted-foreground">Tidak ada anomali terdeteksi.</div>
              <div className="mt-1 text-[10px] text-muted-foreground/70">
                Tidak ada emiten dengan deviasi |Z| &gt; 1.8 dari peer sub-sektornya.
              </div>
            </div>
          ) : (
            <div className="max-h-105 divide-y divide-border overflow-y-auto">
              {(anom.data ?? []).map((a) => (
                <button
                  key={a.symbol + a.type}
                  onClick={() => setDetail(a)}
                  className="w-full text-left hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-stretch">
                    <div
                      className={cn(
                        "w-1 shrink-0",
                        a.severity === "High" ? "bg-negative" : "bg-warning",
                      )}
                    />
                    <div className="flex flex-1 items-center gap-3 px-3 py-3">
                      <div
                        className={cn(
                          "flex h-9 w-12 shrink-0 items-center justify-center border text-[11px] font-bold",
                          a.severity === "High"
                            ? "border-negative/30 bg-negative/10 text-negative"
                            : "border-warning/30 bg-warning/10 text-warning",
                        )}
                      >
                        {a.symbol}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{a.label}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                          {a.company_name}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {a.metric} <span className="text-foreground">{a.value}</span> · peer{" "}
                          {a.average}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            a.deviation >= 0 ? "text-positive" : "text-negative",
                          )}
                          title={
                            a.metric === "Net Margin"
                              ? `Selisih ${a.value} vs rata-rata peer ${a.average} (poin persentase)`
                              : `Selisih ${a.value} vs rata-rata peer ${a.average} (x)`
                          }
                        >
                          {a.deviation >= 0 ? "+" : ""}
                          {a.deviation}
                          {a.metric !== "Net Margin" && "x"}
                        </div>
                        <Tag tone={a.severity === "High" ? "negative" : "warning"} className="mt-1">
                          {a.severity}
                        </Tag>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <InsightLabel>Deviasi Z-score vs peer sub-sektor</InsightLabel>
            <span className="text-[10px] text-muted-foreground">Klik baris untuk detail</span>
          </div>
        </Panel>
      </div>

      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle>{detail?.label}</SheetTitle>
            <SheetDescription>{detail?.company_name}</SheetDescription>
          </SheetHeader>
          {detail && (
            <>
              <div className="grid grid-cols-2 gap-5 p-5">
                {meta("Emiten", detail.symbol)}
                {meta("Sub-sektor", detail.sub_sector)}
                {meta("Tipe Anomali", detail.label)}
                {meta("Tingkat", detail.severity)}
                {meta("Metrik", detail.metric)}
                {meta("Nilai Emiten", detail.value)}
                {meta("Rata-rata Peer", detail.average)}
                {meta("Interpretasi", detail.explanation)}
              </div>
              <div className="border-t border-border px-5 py-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Deviasi Z-score vs peer sub-sektor
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(["pe", "roe", "margin", "der"] as const).map((k) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        Z{" "}
                        {k === "pe"
                          ? "PE"
                          : k === "roe"
                            ? "ROE"
                            : k === "margin"
                              ? "Net Margin"
                              : "DER"}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-semibold tabular-nums",
                          detail.z[k] == null
                            ? "text-muted-foreground/50"
                            : Math.abs(detail.z[k] as number) > 1.8
                              ? (detail.z[k] as number) < 0
                                ? "text-negative"
                                : "text-positive"
                              : "text-foreground",
                        )}
                      >
                        {detail.z[k] == null ? "—" : (detail.z[k] as number).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground/70">
                  Ambang flag |Z| &gt; 1.8. Nilai "—" berarti metrik tidak tersedia untuk emiten ini
                  (misal DER untuk perbankan bukan metrik yang bermakna).
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── News detail Sheet (same pattern as anomaly detail) ────── */}
      <Sheet open={!!newsDetail} onOpenChange={(v) => !v && setNewsDetail(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle className="text-sm leading-snug">Detail Katalis Pasar</SheetTitle>
            <SheetDescription>{newsDetail?.timestamp?.slice(0, 10) ?? ""}</SheetDescription>
          </SheetHeader>
          {newsDetail && (
            <div className="flex flex-col gap-4 overflow-y-auto p-5">
              <h3 className="text-sm font-semibold leading-relaxed text-foreground">
                {newsDetail.title}
              </h3>
              {/* Meta tags */}
              <div className="flex flex-wrap gap-1.5">
                {(newsDetail.symbols ?? []).map((s) => (
                  <Tag key={s} tone="accent">
                    {s.replace(".JK", "")}
                  </Tag>
                ))}
                {newsDetail.sector && <Tag tone="neutral">{newsDetail.sector}</Tag>}
                {(newsDetail.sub_sector ?? []).slice(0, 2).map((ss) => (
                  <Tag key={ss} tone="neutral">
                    {ss}
                  </Tag>
                ))}
                {(newsDetail.tags ?? []).slice(0, 5).map((t) => (
                  <Tag key={t} tone="warning">
                    {t}
                  </Tag>
                ))}
              </div>
              {/* Dimension heatmap if present */}
              {newsDetail.dimension && Object.keys(newsDetail.dimension).length > 0 && (
                <div className="border border-border p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Dimensi Katalis
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(newsDetail.dimension).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-1">
                        <span className="text-[9px] capitalize text-muted-foreground">{k}</span>
                        <span
                          className={cn(
                            "text-[10px] font-semibold tabular-nums",
                            v > 1
                              ? "text-positive"
                              : v > 0
                                ? "text-warning"
                                : "text-muted-foreground",
                          )}
                        >
                          {v > 0 ? `+${v}` : v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-foreground/90">{newsDetail.body}</p>
              {newsDetail.source && (
                <a
                  href={newsDetail.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline"
                >
                  Baca selengkapnya →
                </a>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SECTOR INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Intelijen Sektor — 100% real data, no mock.
 *
 * The sector list is DYNAMIC: it comes from GET /v2/subsectors/ (the API's own
 * authoritative list, cached 7 days). When a new subsector appears upstream it
 * shows up in the dropdown automatically — no hardcoded list, no code change.
 *
 * Per-sector data sources (all live):
 *   - SHI + components : useSectorHealthScores()     (shared with Ringkasan Pasar)
 *   - Growth history   : subsector/report sections=growth
 *   - Company universe : /companies/ screener, ordered by market cap
 *   - Divergensi       : useAnomalies()              (shared with Ringkasan Pasar)
 */

type SortDir = "asc" | "desc";
/** Sort keys for the mock-based DecisionScreener (still mock — next phase). */
type CompanyKey = keyof Pick<
  Company,
  "growth" | "margin" | "roe" | "debt" | "pe" | "safety" | "shi" | "dividend"
>;

/** Renders a value or a dash — never invents data. */
function val(v: number | null | undefined, suffix = ""): string {
  return v == null || !Number.isFinite(v)
    ? "—"
    : `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}${suffix}`;
}

export function SectorIntelligence() {
  // ── Growth chart year-range filter (mirrors the IHSG 1W/1M/3M toggle) ──
  const [growthYears, setGrowthYears] = useState<number>(5);
  // Read synchronously on first render so there's no flash of the default
  // sector before the restore effect runs.
  const [selectedSlug, setSelectedSlug] = useState<string>(
    () => localStorage.getItem("sector.selectedSlug") ?? "",
  );
  const [sortKey, setSortKey] = useState<
    "market_cap" | "pe_ttm" | "roe_ttm" | "der_mrq" | "net_profit_margin"
  >("market_cap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");

  // ── Dynamic sector list from the API ────────────────────────────────────
  const subsectorList = useSubsectorList();
  const sectors = useMemo(() => subsectorList.data ?? [], [subsectorList.data]);

  // Restore from localStorage — default only if no saved value and list arrived
  useEffect(() => {
    if (!selectedSlug && sectors.length > 0 && sectors[0]?.slug) {
      setSelectedSlug(sectors[0].slug);
    }
  }, [sectors, selectedSlug]);

  // Persist choice whenever it changes
  useEffect(() => {
    if (selectedSlug) localStorage.setItem("sector.selectedSlug", selectedSlug);
  }, [selectedSlug]);

  // Centralized setter so persistence is never forgotten
  const selectSector = useCallback((slug: string) => {
    setSelectedSlug(slug);
    localStorage.setItem("sector.selectedSlug", slug);
  }, []);

  const selected = sectors.find((s) => s.slug === selectedSlug) ?? null;

  // ── Live data for the selected sector ───────────────────────────────────
  const universe = useSectorUniverse(selected?.subSector);
  const growth = useSectorGrowthHistory(selected?.slug);
  const shi = useSectorHealthScores();
  const anom = useAnomalies();
  // Shares the useSectorHealthScores cache — 0 extra credits.
  const reportDetail = useSubsectorReportDetail(selected?.slug);

  // SHI entry matching the selected sector (same hook Ringkasan Pasar uses)
  const shiEntry = useMemo(
    () => shi.results.find((s) => s.slug === selectedSlug) ?? null,
    [shi.results, selectedSlug],
  );

  // Ranked list driven by the live dynamic list, not a static array
  const ranked = useMemo(
    () =>
      sectors
        .map((s) => ({
          ...s,
          score: shi.results.find((r) => r.slug === s.slug)?.score ?? null,
          isLive: shi.results.find((r) => r.slug === s.slug)?.isLive ?? false,
        }))
        .filter((s) => s.score != null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [sectors, shi.results],
  );

  // Anomalies for just this sector (shared hook, no extra credits)
  const sectorAnomalies = useMemo(() => {
    const syms = new Set((universe.data ?? []).map((c) => c.symbol));
    return (anom.data ?? []).filter((a) => syms.has(a.symbol));
  }, [anom.data, universe.data]);

  const sorted = useMemo(() => {
    let list = universe.data ?? [];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((c) => (c.symbol + c.company_name).toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last
      if (bv == null) return -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [universe.data, query, sortKey, sortDir]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (
      sortDir === "desc" ? (
        <ChevronDown className="ml-1 inline size-3 text-primary" />
      ) : (
        <ChevronUp className="ml-1 inline size-3 text-primary" />
      )
    ) : (
      <ArrowDownUp className="ml-1 inline size-3 opacity-30" />
    );

  const unit = countLabel(universe.data?.length ?? null);
  const loading = subsectorList.isPending || (selectedSlug && universe.isPending);

  return (
    <div className="space-y-4">
      <PageHeader title="Intelijen Sektor">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari emiten…"
            className="h-8 w-44 pl-8 text-xs"
          />
        </div>
        <select
          value={selectedSlug}
          onChange={(e) => selectSector(e.target.value)}
          disabled={subsectorList.isPending}
          className="h-8 max-w-55 border border-input bg-background px-3 text-xs"
        >
          {subsectorList.isPending && <option>Memuat sektor…</option>}
          {!subsectorList.isPending && sectors.length === 0 && (
            <option>Daftar sektor tidak tersedia</option>
          )}
          {sectors.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.sectorName} · {s.subSector}
            </option>
          ))}
        </select>
        {!subsectorList.isPending && selected && !isSubsectorVerified(selected.slug) && (
          <span className="text-[10px] text-warning">
            Nama tampilan sektor ini belum terverifikasi — data emiten mungkin kosong
          </span>
        )}
        <ExportMenu title={`${selected?.subSector ?? "Sector"} Research`} />
      </PageHeader>

      {/* If the API list itself failed, say so instead of faking data */}
      {subsectorList.isError && (
        <Panel title="Daftar Sektor">
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Gagal memuat daftar sektor dari Sectors API. Coba lagi nanti.
          </div>
        </Panel>
      )}

      <MetricStrip
        items={[
          {
            label: "Sub-sektor terpilih",
            value: selected?.subSector ?? "—",
            sub: selected?.sectorName ?? "—",
          },
          {
            label: "Kesehatan (SHI)",
            value: shiEntry?.score != null ? shiEntry.score : "—",
            tone: shiEntry
              ? shiEntry.score < 45
                ? "negative"
                : shiEntry.score < 60
                  ? "warning"
                  : "positive"
              : undefined,
            sub: shiEntry ? healthLabel(shiEntry.score) : "tidak tersedia",
          },
          {
            label: "Tren",
            value: shiEntry?.trend ?? "—",
            sub: shiEntry?.isLive ? "live Sectors API" : "—",
          },
          {
            label: "Emiten",
            value: loading ? <Skeleton className="h-4 w-10" /> : unit.count,
            sub: unit.sub,
          },
          {
            label: "Market cap agregat",
            value: loading ? (
              <Skeleton className="h-4 w-16" />
            ) : universe.data?.length ? (
              formatIDRCompact(universe.data.reduce((s, c) => s + (c.market_cap ?? 0), 0))
            ) : (
              "—"
            ),
            tone: universe.data?.length ? "positive" : undefined,
            sub: "dari screener",
          },
          {
            label: "Divergensi",
            value: sectorAnomalies.length,
            sub: "anomali terdeteksi",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <Panel
          title={`Pertumbuhan Historis — ${selected?.subSector ?? "—"}`}
          kicker="Pendapatan vs laba per tahun"
          action={
            <div className="flex items-center gap-2">
              {growth.isFetching && (
                <RefreshCw className="size-3 animate-spin text-muted-foreground" />
              )}
              <div className="flex">
                {[3, 5, 8].map((y) => (
                  <Button
                    key={y}
                    size="sm"
                    variant={growthYears === y ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setGrowthYears(y)}
                  >
                    {y}T
                  </Button>
                ))}
              </div>
            </div>
          }
        >
          {growth.isPending ? (
            <div className="flex h-80 items-center justify-center">
              <RefreshCw className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : growth.isError ? (
            <div className="flex h-80 items-center justify-center text-xs text-muted-foreground">
              Gagal memuat data pertumbuhan.
            </div>
          ) : (
            <>
              <GrowthHistoryChart data={growth.data ?? []} years={growthYears} />
              <div className="flex gap-5 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
                <span>
                  <i className="mr-1 inline-block size-1.5 bg-primary" />
                  Pertumbuhan Pendapatan
                </span>
                <span>
                  <i className="mr-1 inline-block size-1.5 bg-warning" />
                  Pertumbuhan Laba
                </span>
                <span className="ml-auto">Sumber: growth.weighted_avg_growth_data</span>
              </div>
              {/* ── Why each component scored what it did (raw report inputs) ── */}
              {reportDetail && (
                <div className="mt-5 border-t border-border pt-4">
                  <div className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    Mengapa skor ini — input laporan sub-sector
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      {
                        label: "Pertumbuhan",
                        Icon: TrendingUp,
                        detail:
                          reportDetail.growth.revenue_growth != null
                            ? `Pertumbuhan pendapatan rata-rata ${fmtPct(reportDetail.growth.revenue_growth)}${reportDetail.growth.earnings_growth != null ? `, laba ${fmtPct(reportDetail.growth.earnings_growth)}` : ""}.`
                            : "Data pertumbuhan tidak tersedia → skor 0.",
                        note: "Dinormalisasi -10%…+10% → 0…25",
                        available: reportDetail.growth.revenue_growth != null,
                      },
                      {
                        label: "Stabilitas",
                        Icon: Shield,
                        detail:
                          reportDetail.stability.max_drawdown != null
                            ? `Drawdown maksimum ${fmtPct(reportDetail.stability.max_drawdown)} (lebih dangkal = lebih stabil).`
                            : "Data stabilitas tidak tersedia → skor 0.",
                        note: "Dinormalisasi 0…-60% → 0…25",
                        available: reportDetail.stability.max_drawdown != null,
                      },
                      {
                        label: "Valuasi",
                        Icon: Scale,
                        detail:
                          reportDetail.valuation?.pe != null && reportDetail.valuation.pe > 0
                            ? `P/E ${reportDetail.valuation.pe.toFixed(1)} → earnings yield ${(100 / reportDetail.valuation.pe).toFixed(1)}%.`
                            : "P/E tidak tersedia atau negatif → skor 0 (per spesifikasi).",
                        note: "Yield 0…15% → 0…25; P/E negatif = 0",
                        available:
                          reportDetail.valuation?.pe != null && reportDetail.valuation.pe > 0,
                      },
                      {
                        label: "Momentum",
                        Icon: Activity,
                        detail:
                          reportDetail.market_cap?.mcap_change_1w != null ||
                          reportDetail.market_cap?.mcap_change_ytd != null
                            ? `1M ${fmtPct(reportDetail.market_cap?.mcap_change_1w, true)} · YTD ${fmtPct(reportDetail.market_cap?.mcap_change_ytd, true)}.`
                            : "Data market cap tidak tersedia → skor 0.",
                        note: "Bobot 30% 1M + 70% YTD, dipetakan -30%…+30% → 0…25",
                        available:
                          reportDetail.market_cap?.mcap_change_1w != null ||
                          reportDetail.market_cap?.mcap_change_ytd != null,
                      },
                    ].map((row) => {
                      const Icon = row.Icon;
                      return (
                        <div
                          key={row.label}
                          className="rounded-md border border-border/60 bg-muted/20 p-3"
                        >
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <Icon
                              className={`size-3 ${row.available ? "text-primary" : "text-muted-foreground/50"}`}
                            />
                            <span className="text-[10px] font-medium text-foreground">
                              {row.label}
                            </span>
                            {!row.available && (
                              <span className="ml-auto rounded-sm bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                                N/A
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] leading-relaxed text-muted-foreground">
                            {row.detail}
                          </p>
                          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground/60">
                            {row.note}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel
          title="Breakdown Kesehatan Sektor"
          kicker={shiEntry?.isLive ? "Live Sectors API" : "Memuat…"}
        >
          <div className="p-5">
            <div className="flex items-end justify-between border-b border-border pb-4">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">SHI Komposit</div>
                <div className="mt-1 text-5xl font-semibold text-primary">
                  {shiEntry?.score != null ? shiEntry.score : "—"}
                </div>
              </div>
              {shiEntry && (
                <Tag tone={toneFor(shiEntry.score - 64)}>{healthLabel(shiEntry.score)}</Tag>
              )}
            </div>
            {shiEntry ? (
              (
                [
                  ["Pertumbuhan", shiEntry.growth, 30],
                  ["Stabilitas", shiEntry.stability, 25],
                  ["Valuasi", shiEntry.valuation, 25],
                  ["Momentum", shiEntry.momentum, 20],
                ] as [string, number, number][]
              ).map(([l, v, w]) => (
                <div className="mt-4" key={l}>
                  <div className="mb-2 flex justify-between text-xs">
                    <span>{l}</span>
                    <span className="text-muted-foreground">
                      {v.toFixed(1)} / 25 · bobot {w}%
                    </span>
                  </div>
                  <Bar value={v * 4} tone={v < 8 ? "negative" : v < 15 ? "warning" : "positive"} />
                </div>
              ))
            ) : (
              <div className="mt-4 text-[10px] text-muted-foreground">Skor SHI belum tersedia.</div>
            )}

            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-[10px] uppercase text-muted-foreground">
                Peringkat sektor (live)
              </div>
              {ranked.length === 0 ? (
                <div className="text-[10px] text-muted-foreground">Belum ada skor.</div>
              ) : (
                ranked.slice(0, 12).map((s, i) => (
                  <button
                    key={s.slug}
                    onClick={() => selectSector(s.slug)}
                    className={cn(
                      "flex w-full items-center justify-between py-1.5 text-xs transition-colors hover:text-primary",
                      s.slug === selectedSlug
                        ? "font-medium text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-5 tabular-nums text-[10px]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate">{s.subSector}</span>
                    </span>
                    <span className="ml-2 tabular-nums">{s.score}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title={`Universe Emiten — ${selected?.subSector ?? "—"}`}
        kicker="Screener Sectors API"
        action={
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {sorted.length} emiten
          </span>
        }
      >
        {universe.isPending ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : universe.isError ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Gagal memuat universe emiten.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-225">
              <thead>
                <tr>
                  <th className={th}>Ticker</th>
                  <th className={th}>Emiten</th>
                  <th className={th}>Harga</th>
                  <th className={th}>Ubah</th>
                  <th
                    className={cn(th, "cursor-pointer hover:text-foreground")}
                    onClick={() => toggleSort("market_cap")}
                  >
                    Mkt Cap <SortIcon k="market_cap" />
                  </th>
                  <th
                    className={cn(th, "cursor-pointer hover:text-foreground")}
                    onClick={() => toggleSort("pe_ttm")}
                  >
                    P/E <SortIcon k="pe_ttm" />
                  </th>
                  <th
                    className={cn(th, "cursor-pointer hover:text-foreground")}
                    onClick={() => toggleSort("roe_ttm")}
                  >
                    ROE <SortIcon k="roe_ttm" />
                  </th>
                  <th
                    className={cn(th, "cursor-pointer hover:text-foreground")}
                    onClick={() => toggleSort("der_mrq")}
                  >
                    DER <SortIcon k="der_mrq" />
                  </th>
                  <th
                    className={cn(th, "cursor-pointer hover:text-foreground")}
                    onClick={() => toggleSort("net_profit_margin")}
                  >
                    Margin <SortIcon k="net_profit_margin" />
                  </th>
                  <th className={th}>Divergensi</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td className={td} colSpan={10}>
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        {query
                          ? "Tidak ada emiten yang cocok."
                          : "Tidak ada emiten pada sub-sektor ini."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  sorted.map((c) => {
                    const a = sectorAnomalies.find((x) => x.symbol === c.symbol);
                    return (
                      <tr key={c.symbol} className="hover:bg-secondary/50">
                        <td className={cn(td, "font-semibold text-primary")}>{c.symbol}</td>
                        <td className={cn(td, "max-w-55 truncate")}>{c.company_name || "—"}</td>
                        <td className={cn(td, "tabular-nums")}>{val(c.last_close_price)}</td>
                        <td className={td}>
                          {c.daily_close_change != null ? (
                            <Change value={c.daily_close_change * 100} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={cn(td, "tabular-nums")}>{formatMarketCap(c.market_cap)}</td>
                        <td className={cn(td, "tabular-nums")}>{val(c.pe_ttm)}</td>
                        <td className={cn(td, "tabular-nums")}>
                          {c.roe_ttm != null ? `${(c.roe_ttm * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className={cn(td, "tabular-nums")}>{val(c.der_mrq)}</td>
                        <td className={cn(td, "tabular-nums")}>
                          {c.net_profit_margin != null
                            ? `${(c.net_profit_margin * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className={td}>
                          {a ? (
                            <Tag tone={a.severity === "High" ? "negative" : "warning"}>
                              {a.label}
                            </Tag>
                          ) : !isSubsectorVerified(selected?.slug ?? "") ? (
                            <span
                              className="text-muted-foreground/50"
                              title="Detector belum dijalankan untuk sub-sektor ini"
                            >
                              n/a
                            </span>
                          ) : (
                            <span
                              className="text-muted-foreground"
                              title="Tidak ada anomali — emiten dalam batas normal peer"
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Divergensi Sektor" kicker="Deteksi live Z-score">
        {!anom.data ? (
          <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground">
            <RefreshCw className="size-3 animate-spin" /> Memuat anomali…
          </div>
        ) : sectorAnomalies.length === 0 ? (
          <>
            <div className="p-8 text-center text-xs text-muted-foreground">
              Tidak ada divergensi terdeteksi untuk sub-sektor ini.
            </div>
            <div className="border-t border-border px-4 py-2.5">
              <InsightLabel>Semua emiten dalam batas normal peer</InsightLabel>
            </div>
          </>
        ) : (
          <div className="grid gap-px bg-border md:grid-cols-2">
            {sectorAnomalies.slice(0, 4).map((a) => (
              <div className="bg-card p-4" key={a.symbol + a.type}>
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-primary">
                    {a.symbol} · {a.metric}
                  </span>
                  <Tag tone={a.severity === "High" ? "negative" : "warning"}>{a.severity}</Tag>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {meta("Emiten", a.value)}
                  {meta("Rata-rata peer", a.average)}
                  {meta(
                    a.metric === "Net Margin" ? "Deviasi (pp)" : "Deviasi (x)",
                    `${a.deviation >= 0 ? "+" : ""}${a.deviation}${a.metric !== "Net Margin" ? "x" : ""}`,
                  )}
                </div>
                <div className="mt-4 border-l-2 border-primary pl-3 text-xs">{a.label}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/** "12 emiten" / "belum ada data" — never invents a count. */
function countLabel(n: number | null): { count: string; sub: string } {
  if (n == null) return { count: "—", sub: "memuat…" };
  if (n === 0) return { count: "0", sub: "tid ada data dari screener" };
  return { count: String(n), sub: "tercatat di screener" };
}

// Shared watchlist-aware company row
function CompanyRow({ c }: { c: Company }) {
  const { has, add, remove } = useWatchlistStore();
  const inList = has(c.ticker);
  return (
    <tr className="hover:bg-secondary/50">
      <td className={cn(td, "font-semibold text-primary")}>{c.ticker}</td>
      <td className={td}>{c.name}</td>
      <td className={td}>{formatIDR(c.price)}</td>
      <td className={td}>
        <Change value={c.change} />
      </td>
      <td className={td}>Rp {c.marketCap}T</td>
      <td className={td}>{c.growth}%</td>
      <td className={td}>{c.margin}%</td>
      <td className={td}>{c.debt}%</td>
      <td className={td}>{c.pe || "NM"}x</td>
      <td className={td}>
        <Score value={c.safety} />
      </td>
      <td className={td}>
        {c.anomaly ? (
          <Tag tone="warning">{c.anomaly}</Tag>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={td}>
        <button
          onClick={() => (inList ? remove(c.ticker) : add(c.ticker))}
          className={cn(
            "rounded p-1 transition-colors",
            inList
              ? "text-primary hover:text-negative"
              : "text-muted-foreground hover:text-primary",
          )}
          title={inList ? "Hapus dari pantauan" : "Tambah ke pantauan"}
        >
          {inList ? <Star className="size-3.5 fill-current" /> : <Star className="size-3.5" />}
        </button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPANY TERMINAL
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPANY TERMINAL — real data via Sectors API company reports
// Implements (Features To Be Implemented.md):
//   Algoritma 2 — Piotroski F-Score
//   Algoritma 3 — Altman Z"-Score
//   Algoritma 4 — Dominance Score (head-to-head, 2–5 emiten)
//   Gap 2      — Valuation Percentile Rank (5Y)
//   A          — Free Float & Liquidity Risk
//   B          — Analyst Expectation Gap
//   E          — Revenue Concentration HHI (lazy, on panel open)
// ─────────────────────────────────────────────────────────────────────────────

/** One selected peer with its (possibly still loading) report. */
interface PeerView {
  symbol: string;
  report: CompanyReportRaw | null;
  isPending: boolean;
  isError: boolean;
}

export function CompanyTerminal() {
  // Default peer set (large-cap banks) used ONLY on first visit — no stored
  // selection yet. After that the user's choice persists in localStorage
  // (same pattern as `sector.selectedSlug`) and the picker is authoritative.
  const DEFAULT_PEERS = ["BBCA", "BBRI", "BMRI"];
  const [selected, setSelected] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("terminal.peers");
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === "string").slice(0, 5);
      }
    } catch {
      // corrupted entry — fall through to defaults
    }
    return DEFAULT_PEERS;
  });
  const [searchQ, setSearchQ] = useState("");
  const [showSegments, setShowSegments] = useState(false);
  const { has, add, remove } = useWatchlistStore();

  useEffect(() => {
    try {
      localStorage.setItem("terminal.peers", JSON.stringify(selected));
    } catch {
      // non-fatal
    }
  }, [selected]);

  // ── Data hooks ──────────────────────────────────────────────────────────
  const universe = useTopCompanies(50);
  const reportQueries = useCompanyReports(selected);
  const ffMap = useFreeFloatMap();

  const peers: PeerView[] = selected.map((symbol, i) => {
    const q = reportQueries[i];
    return {
      symbol,
      report: (q?.data as CompanyReportRaw | undefined) ?? null,
      isPending: q?.isPending ?? false,
      isError: q?.isError ?? false,
    };
  });

  const searchResults = useMemo(() => {
    const list = universe.data ?? [];
    if (!searchQ) return list;
    const q = searchQ.toLowerCase();
    return list.filter((c) => (c.ticker + c.name).toLowerCase().includes(q));
  }, [universe.data, searchQ]);

  const toggle = (t: string) =>
    setSelected((p) =>
      p.includes(t)
        ? // Always allow deselect — the panels show their own empty/minimum
          // states, so a 0/1-peer selection is legal UI.
          p.filter((x) => x !== t)
        : p.length < 5
          ? [...p, t]
          : p,
    );

  // ── Derived: Piotroski / Altman / percentile / analyst gap / free float ──
  const analyses = useMemo(
    () =>
      peers.map((p) => {
        const r = p.report;
        const input = r ? toCompanyFinancialsInput(r) : null;
        const fScore = input ? piotroskiFScore(input) : null;
        const altman = input ? altmanZScore(input) : null;

        // Valuation percentile (Gap 2)
        const hv = r?.valuation?.historical_valuation;
        const yearlyPe: Array<{ year: string; pe: number | null }> = Array.isArray(hv)
          ? hv
              .map((e) => ({
                year: String(e["year"] ?? ""),
                pe: typeof e["pe"] === "number" ? (e["pe"] as number) : null,
              }))
              .sort((a, b) => a.year.localeCompare(b.year))
          : hv && typeof hv === "object"
            ? Object.entries(hv as Record<string, unknown>)
                .filter(([y]) => /^\d{4}$/.test(y))
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([year, o]) => ({
                  year,
                  pe:
                    o &&
                    typeof o === "object" &&
                    typeof (o as Record<string, unknown>)["pe"] === "number"
                      ? ((o as Record<string, unknown>)["pe"] as number)
                      : null,
                }))
            : [];
        const peTtm =
          yearlyPe.length > 0
            ? ([...yearlyPe].reverse().find((y) => y.pe != null && (y.pe as number) > 0)?.pe ??
              null)
            : null;
        const percentile = valuationPercentile(yearlyPe, peTtm);

        // Analyst gap (B)
        const heps = r?.financials?.historical_eps ?? null;
        const epsGrowth2y = (() => {
          if (!heps) return null;
          const rows = Object.entries(heps)
            .filter(([y]) => /^\d{4}$/.test(y))
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([, o]) =>
              o && typeof o["eps_growth"] === "number" ? (o["eps_growth"] as number) : null,
            )
            .filter((v): v is number => v != null);
          if (rows.length < 2) return null;
          return (rows[rows.length - 1]! + rows[rows.length - 2]!) / 2;
        })();
        const forecasts = r?.future?.company_growth_forecasts ?? null;
        const forecastEpsGrowth =
          forecasts && forecasts.length > 0 && typeof forecasts[0]?.["eps_growth"] === "number"
            ? (forecasts[0]["eps_growth"] as number)
            : null;
        const forwardPe = r?.valuation?.forward_pe ?? null;
        const gap = analystExpectationGap({
          actualEpsGrowth: epsGrowth2y,
          forecastEpsGrowth,
          forwardPe,
          peTtm,
        });

        // Free float (A) — from the one-shot map, no per-symbol call
        const ff = ffMap.data?.get(p.symbol) ?? null;
        const floatRisk = classifyFreeFloat(ff, null);

        return {
          symbol: p.symbol,
          report: r,
          fScore,
          altman,
          percentile,
          gap,
          floatRisk,
          yearlyPe,
        };
      }),
    [peers, ffMap.data],
  );

  // ── Derived: Dominance Score (Algoritma 4) across the peer set ──────────
  const dominance = useMemo(() => {
    if (peers.length < 2) return [];
    const rows: DominanceInput[] = analyses.map((a) => {
      const r = a.report;
      const fin = r?.financials;
      const ratios = fin?.historical_financial_ratio ?? null;
      const lastRow = Array.isArray(fin?.historical_financials)
        ? ((fin?.historical_financials as Array<Record<string, unknown>>).at(-1) ?? null)
        : null;
      const y = lastRow ? String(lastRow["year"]) : null;

      const numFrom = (group: string, key: string) =>
        y && ratios ? ratioNum(ratios, y, group, key) : null;
      const val = (k: string) =>
        lastRow && typeof lastRow[k] === "number" ? (lastRow[k] as number) : null;

      const revenue = val("revenue");
      const revenuePrev = (() => {
        const arr =
          (fin?.historical_financials as Array<Record<string, unknown>> | undefined) ?? null;
        if (!Array.isArray(arr) || arr.length < 2) return null;
        const p = arr[arr.length - 2];
        return p && typeof p["revenue"] === "number" ? (p["revenue"] as number) : null;
      })();
      const revGrowth =
        revenue != null && revenuePrev != null && revenuePrev !== 0
          ? (revenue - revenuePrev) / revenuePrev
          : null;

      const peVsPeer = (() => {
        const lastVal = Array.isArray(r?.valuation?.historical_valuation)
          ? (r?.valuation?.historical_valuation as Array<Record<string, unknown>>).at(-1)
          : null;
        const pe = lastVal && typeof lastVal["pe"] === "number" ? (lastVal["pe"] as number) : null;
        const peer =
          lastVal && typeof lastVal["pe_peer_avg"] === "number"
            ? (lastVal["pe_peer_avg"] as number)
            : null;
        return pe != null && peer != null && peer > 0 ? pe / peer : null;
      })();

      return {
        symbol: a.symbol,
        roe: numFrom("profitability", "roe"),
        netMargin: numFrom("profitability", "net_profit_margin"),
        ebitdaMargin: (() => {
          const ebitda = val("ebitda");
          return ebitda != null && revenue != null && revenue !== 0 ? ebitda / revenue : null;
        })(),
        der: numFrom("leverage", "debt_to_equity_ratio"),
        currentRatio: numFrom("liquidity", "current_ratio"),
        interestCoverage: numFrom("leverage", "interest_coverage_ratio"),
        revenueGrowth: revGrowth,
        epsGrowth: (() => {
          const heps2 = r?.financials?.historical_eps ?? null;
          if (!heps2) return null;
          const rows = Object.entries(heps2)
            .filter(([yr]) => /^\d{4}$/.test(yr))
            .sort((x, z) => x[0].localeCompare(z[0]));
          const last = rows.at(-1)?.[1];
          return last && typeof last["eps_growth"] === "number"
            ? (last["eps_growth"] as number)
            : null;
        })(),
        peVsPeer,
        pb: (() => {
          const lastVal = Array.isArray(r?.valuation?.historical_valuation)
            ? (r?.valuation?.historical_valuation as Array<Record<string, unknown>>).at(-1)
            : null;
          return lastVal && typeof lastVal["pb"] === "number" ? (lastVal["pb"] as number) : null;
        })(),
        yieldTtm: r?.dividend?.yield_ttm ?? null,
        payoutRatio: r?.dividend?.payout_ratio ?? null,
        marketCap: r?.overview?.market_cap ?? null,
      };
    });
    return dominanceScore(rows);
  }, [analyses, peers]);

  // ── Comparison matrix rows (live values, "—" while loading) ─────────────
  const lastRatios = (a: (typeof analyses)[number], group: string, key: string): number | null => {
    const r = a.report;
    const ratios = r?.financials?.historical_financial_ratio ?? null;
    const arr = Array.isArray(r?.financials?.historical_financials)
      ? (r?.financials?.historical_financials as Array<Record<string, unknown>>)
      : [];
    const lastRow = arr.at(-1) ?? null;
    const y = lastRow ? String(lastRow["year"]) : null;
    return y && ratios ? ratioNum(ratios, y, group, key) : null;
  };

  const matrixRows: Array<{
    label: string;
    tooltip: string;
    get: (a: (typeof analyses)[number]) => string;
  }> = [
    {
      label: "Pertumbuhan Pendapatan",
      tooltip: "Pertumbuhan revenue year-on-year (tahun fiskal terakhir)",
      get: (a) => {
        const r = a.report;
        const arr = Array.isArray(r?.financials?.historical_financials)
          ? (r?.financials?.historical_financials as Array<Record<string, unknown>>)
          : [];
        if (arr.length < 2) return "—";
        const rev = arr.at(-1)?.["revenue"];
        const prev = arr.at(-2)?.["revenue"];
        if (typeof rev !== "number" || typeof prev !== "number" || prev === 0) return "—";
        return `${(((rev - prev) / prev) * 100).toFixed(1)}%`;
      },
    },
    {
      label: "Net Margin",
      tooltip: "Margin laba bersih tahun fiskal terakhir",
      get: (a) => {
        const v = lastRatios(a, "profitability", "net_profit_margin");
        return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
      },
    },
    {
      label: "ROE",
      tooltip: "Return on Equity tahun fiskal terakhir",
      get: (a) => {
        const v = lastRatios(a, "profitability", "roe");
        return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
      },
    },
    {
      label: "Rasio Utang (DER)",
      tooltip: "Debt-to-Equity ratio — null untuk bank (tidak bermakna)",
      get: (a) => {
        const v = lastRatios(a, "leverage", "debt_to_equity_ratio");
        return v == null ? "NM" : `${v.toFixed(2)}x`;
      },
    },
    {
      label: "Valuasi P/E",
      tooltip: "PE historis tahun terakhir (NM = negatif/tidak bermakna)",
      get: (a) => {
        const pe =
          [...a.yearlyPe].reverse().find((y) => y.pe != null && (y.pe as number) > 0)?.pe ?? null;
        return pe == null ? "NM" : `${pe.toFixed(1)}x`;
      },
    },
    {
      label: "Forward P/E",
      tooltip: "PE berbasis estimasi laba tahun depan",
      get: (a) => {
        const v = a.report?.valuation?.forward_pe ?? null;
        return v == null ? "—" : `${v.toFixed(1)}x`;
      },
    },
    {
      label: "Dividend Yield",
      tooltip: "Yield dividen trailing twelve months",
      get: (a) => {
        const v = a.report?.dividend?.yield_ttm ?? null;
        return v == null ? "—" : `${(v * 100).toFixed(2)}%`;
      },
    },
    {
      label: "Free Float",
      tooltip: "Porsi saham beredar milik publik (endpoint free-float)",
      get: (a) => {
        const v = a.floatRisk.freeFloat;
        return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
      },
    },
    {
      label: "Piotroski F-Score",
      tooltip:
        "9 sinyal fundamental biner (Algoritma 2): profitabilitas 4, leverage & likuiditas 3, efisiensi 2",
      get: (a) => (a.fScore?.available ? `${a.fScore.total}/9` : "—"),
    },
    {
      label: 'Altman Z"-Score',
      tooltip:
        "Indikator distress (Algoritma 3): >2.6 aman, 1.1–2.6 abu-abu, ≤1.1 bahaya. Modifikasi perbankan untuk X1/X4.",
      get: (a) => (a.altman?.score != null ? a.altman.score.toFixed(2) : "—"),
    },
    {
      label: "Valuation Percentile (5Y)",
      tooltip: "Persentil PE saat ini vs riwayat 5 tahun (Gap 2). ≥80 mahal, ≤20 murah.",
      get: (a) => (a.percentile.percentile != null ? `P${a.percentile.percentile}` : "—"),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Terminal Emiten">
        <ExportMenu title="Peer Comparison" />
      </PageHeader>
      <Panel
        title="Pemilihan Peer"
        kicker="2–5 emiten"
        action={
          <span className="text-[10px] text-muted-foreground">{selected.length}/5 dipilih</span>
        }
      >
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Cari ticker atau nama emiten… (50 emiten teratas IDX)"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {universe.isPending && <Skeleton className="h-7 w-40" />}
          {universe.isError && (
            <span className="text-xs text-muted-foreground">Universe emiten gagal dimuat.</span>
          )}
          {!universe.isPending && searchResults.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Tidak ada emiten yang cocok dengan &ldquo;{searchQ}&rdquo;.
            </span>
          )}
          {searchResults.slice(0, 20).map((c) => (
            <button
              key={c.ticker}
              onClick={() => toggle(c.ticker)}
              className={cn(
                "flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-all",
                selected.includes(c.ticker)
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
              )}
            >
              {selected.includes(c.ticker) ? <X className="size-3" /> : <Plus className="size-3" />}
              <span className="font-semibold">{c.ticker}</span>
              <span className="hidden text-[10px] sm:inline">
                {c.name.split(" ").slice(0, 2).join(" ")}
              </span>
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 2xl:grid-cols-[1.2fr_.8fr]">
        <Panel
          title="Matriks Komparasi Peer"
          kicker="Fundamental live Sectors API"
          action={
            <span className="text-[10px] text-muted-foreground">
              {peers.length === 0
                ? "0 emiten dipilih"
                : reportQueries.some((q) => q?.isPending)
                  ? "Memuat laporan…"
                  : "6 kredit/simbol · cache 24j"}
            </span>
          }
        >
          {peers.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
              Pilih emiten dari panel di atas untuk membandingkan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-170">
                <thead>
                  <tr>
                    <th className={th}>Indikator</th>
                    {peers.map((c) => (
                      <th className={th} key={c.symbol}>
                        <div className="text-primary">{c.symbol}</div>
                        <div className="mt-1 normal-case text-muted-foreground">
                          {c.isPending
                            ? "Memuat…"
                            : (c.report?.company_name?.split(" ").slice(0, 2).join(" ") ?? "—")}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map(({ label, tooltip, get }) => (
                    <tr key={label}>
                      <td className={cn(td, "text-muted-foreground")}>
                        <span className="flex items-center gap-1">
                          {label}
                          <MethodTip text={tooltip} />
                        </span>
                      </td>
                      {analyses.map((a, colIdx) => {
                        const val = a.report ? get(a) : "—";
                        return (
                          <td
                            key={a.symbol}
                            className={cn(
                              td,
                              "text-base font-medium",
                              colIdx === 0 && "bg-accent/30",
                            )}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel
          title="Dominance Score"
          kicker="Algoritma 4 · head-to-head"
          action={
            <MethodTip text="Perbandingan berbasis rank lintas peer terpilih (profitabilitas 20, keamanan 20, pertumbuhan 20, valuasi 20, pasar 20). DER, PE-vs-peer, dan PB dinilai terbalik. Bukan rekomendasi investasi." />
          }
        >
          <div className="p-4">
            {peers.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Pilih minimal 2 emiten untuk melihat Dominance Score.
              </div>
            ) : dominance.length === 0 && peers.length < 2 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Pilih minimal 2 emiten.
              </div>
            ) : null}
            {[...dominance]
              .sort((a, b) => b.total - a.total)
              .map((d, i) => {
                const inList = has(d.symbol);
                return (
                  <div key={d.symbol} className="border-b border-border py-4 first:pt-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="w-6 text-xs text-muted-foreground">0{i + 1}</span>
                      <span className="w-16 text-sm font-semibold">{d.symbol}</span>
                      <div className="flex-1">
                        <Bar value={d.total} tone={i === 0 ? "positive" : "accent"} />
                      </div>
                      <span className="ml-3 text-xl font-semibold text-data">
                        {d.total.toFixed(1)}
                      </span>
                      <button
                        onClick={() => (inList ? remove(d.symbol) : add(d.symbol))}
                        className={cn(
                          "rounded p-1 transition-colors",
                          inList ? "text-primary" : "text-muted-foreground hover:text-primary",
                        )}
                      >
                        <Star className={cn("size-3.5", inList && "fill-current")} />
                      </button>
                    </div>
                    <div className="ml-24 flex flex-wrap gap-3 text-[9px] text-muted-foreground">
                      <span>Profit {d.profitability.toFixed(1)}</span>
                      <span>Keamanan {d.safety.toFixed(1)}</span>
                      <span>Pertumbuhan {d.growth.toFixed(1)}</span>
                      <span>Valuasi {d.value.toFixed(1)}</span>
                      <span>Pasar {d.market.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            {dominance.length > 0 && (
              <div className="mt-4">
                <InsightLabel>Relatif terhadap peer yang dipilih</InsightLabel>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ── Piotroski + Altman (Algoritma 2 & 3) ─────────────────────────── */}
      <Panel
        title="Financial Safety & Distress"
        kicker={'Piotroski F-Score & Altman Z"-Score'}
        action={
          <MethodTip text="Piotroski (0–9): profitabilitas 4 · leverage/likuiditas 3 · efisiensi 2. Altman Z (non-manufaktur): 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4; >2.6 aman, 1.1–2.6 abu-abu, ≤1.1 distress. Bank memakai modifikasi giro+tabungan/ATMR." />
        }
      >
        {analyses.length === 0 ? (
          <div className="flex items-center justify-center gap-1.5 p-8 text-xs text-muted-foreground">
            <MousePointerClick className="size-3.5" />
            Pilih emiten untuk menghitung Piotroski F-Score dan Altman Z-Score.
          </div>
        ) : (
          <div className="grid gap-px bg-border md:grid-cols-3">
            {analyses.map((a) => {
              const inList = has(a.symbol);
              const fs = a.fScore;
              const alt = a.altman;
              const zoneTone: Tone =
                alt?.zone === "safe"
                  ? "positive"
                  : alt?.zone === "grey"
                    ? "warning"
                    : alt?.zone === "distress"
                      ? "negative"
                      : "neutral";
              const fsTone: Tone = fs
                ? fs.total >= 7
                  ? "positive"
                  : fs.total >= 4
                    ? "warning"
                    : "negative"
                : "neutral";
              return (
                <div className="bg-card p-5" key={a.symbol}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{a.symbol}</span>
                    <button
                      onClick={() => (inList ? remove(a.symbol) : add(a.symbol))}
                      className={cn(
                        "rounded p-1 transition-colors",
                        inList ? "text-primary" : "text-muted-foreground hover:text-primary",
                      )}
                    >
                      <Star className={cn("size-3.5", inList && "fill-current")} />
                    </button>
                  </div>

                  {/* Piotroski */}
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Piotroski F-Score
                      </div>
                      {fs?.available ? (
                        <div className="text-4xl font-semibold">
                          {fs.total}
                          <span className="text-lg text-muted-foreground">/9</span>
                        </div>
                      ) : (
                        <div className="text-lg text-muted-foreground">Data tidak lengkap</div>
                      )}
                    </div>
                    {fs?.available && (
                      <div className="flex flex-col items-end gap-1 text-[9px] text-muted-foreground">
                        <span>Profit {fs.profitability}/4</span>
                        <span>Leverage {fs.leverage}/3</span>
                        <span>Efisiensi {fs.efficiency}/2</span>
                      </div>
                    )}
                  </div>
                  {fs?.available && (
                    <div className="mt-3 space-y-1">
                      {fs.detail.map((d) => (
                        <div key={d.id} className="flex items-center gap-1.5 text-[10px]">
                          <MethodTip wide text={METRIC_TIP(d.id, d.note)} />
                          <span
                            className={cn(
                              "w-4 font-semibold",
                              d.point ? "text-positive" : "text-muted-foreground",
                            )}
                          >
                            {d.id}
                          </span>
                          <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
                          <span
                            className={cn(
                              "tabular-nums",
                              d.point ? "text-positive" : "text-negative",
                            )}
                          >
                            {d.point}
                          </span>
                        </div>
                      ))}
                      <Tag tone={fsTone} className="mt-2">
                        {fs.total >= 7
                          ? "Kualitas Fundamental Kuat"
                          : fs.total >= 4
                            ? "Campuran"
                            : "Lemah"}
                      </Tag>
                    </div>
                  )}

                  {/* Altman */}
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Altman Z-Score {alt?.isBank ? "(Bank)" : ""}
                        </div>
                        {alt?.score != null ? (
                          <div className="text-4xl font-semibold">{alt.score.toFixed(2)}</div>
                        ) : (
                          <div className="text-lg text-muted-foreground">Data tidak lengkap</div>
                        )}
                      </div>
                      {alt?.zone && <Tag tone={zoneTone}>{altmanZoneLabel(alt.zone)}</Tag>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {alt?.components.map((c) => (
                        <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
                          <MethodTip
                            wide
                            text={METRIC_TIP(
                              c.id,
                              c.ratio != null
                                ? `${c.ratio.toFixed(2)} → kontribusi ${(c.ratio * c.coefficient).toFixed(2)}`
                                : "—",
                            )}
                          />
                          <span className="text-muted-foreground">
                            {c.id} = {c.ratio != null ? c.ratio.toFixed(2) : "—"}
                          </span>
                          <span className="ml-auto text-foreground">× {c.coefficient}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── Gap 2 + A + B + E per-peer cards ───────────────────────────── */}
      <Panel
        title="Konteks Valuasi & Risiko"
        kicker="Gap 2 · Free Float · Analyst Gap · HHI"
        action={
          <MethodTip text="Percentile Rank 5Y membandingkan PE saat ini dengan 5 tahun riwayat. Free Float dari endpoint /free-float (klasifikasi <15% / 15–35% / ≥35%). Analyst Gap = realisasi EPS growth (rata-rata 2Y) − proyeksi analis. HHI konsentrasi pendapatan per segmen." />
        }
      >
        {analyses.length === 0 ? (
          <div className="flex items-center justify-center gap-1.5 p-8 text-xs text-muted-foreground">
            <MousePointerClick className="size-3.5" />
            Pilih emiten untuk melihat valuasi, free float, analyst gap, dan HHI.
          </div>
        ) : (
          <div className="grid gap-px bg-border md:grid-cols-3">
            {analyses.map((a) => {
              const r = a.report;
              const pctlTone: Tone =
                a.percentile.percentile == null
                  ? "neutral"
                  : a.percentile.percentile >= 80
                    ? "negative"
                    : a.percentile.percentile <= 20
                      ? "positive"
                      : "accent";
              const gapTone: Tone =
                a.gap.gap == null
                  ? "neutral"
                  : a.gap.gap > 0.1
                    ? "positive"
                    : a.gap.gap < -0.1
                      ? "negative"
                      : "accent";
              return (
                <div className="bg-card p-5" key={a.symbol}>
                  <div className="text-sm font-semibold">{a.symbol}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r?.overview?.sub_sector ?? "—"} · {r?.overview?.sector ?? ""}
                  </div>

                  {/* Gap 2 — Valuation Percentile Rank */}
                  <div className="mt-4 border-b border-border pb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Valuation Percentile (5Y)
                      </div>
                      <Tag tone={pctlTone}>{a.percentile.label}</Tag>
                    </div>
                    <div className="mt-1 text-3xl font-semibold">
                      {a.percentile.percentile != null ? `P${a.percentile.percentile}` : "—"}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {a.percentile.note}
                    </div>
                  </div>

                  {/* A — Free Float & Liquidity Risk */}
                  <div className="mt-4 border-b border-border pb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Free Float & Likuiditas
                      </div>
                      <Tag tone={floatTone(a.floatRisk.level)}>{a.floatRisk.label}</Tag>
                    </div>
                    <div className="mt-1 text-2xl font-semibold">
                      {a.floatRisk.freeFloat != null
                        ? `${(a.floatRisk.freeFloat * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{a.floatRisk.note}</div>
                    {a.floatRisk.liquidityCliff && (
                      <div className="mt-2 rounded border border-negative/30 bg-negative/10 p-2 text-[10px] text-negative">
                        Liquidity Cliff — sulit exit saat market stress.
                      </div>
                    )}
                  </div>

                  {/* B — Analyst Expectation Gap */}
                  <div className="mt-4 border-b border-border pb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Analyst Expectation Gap
                      </div>
                      <Tag tone={gapTone}>{a.gap.label}</Tag>
                    </div>
                    <div className="mt-1 text-2xl font-semibold">
                      {a.gap.gap != null ? `${(a.gap.gap * 100).toFixed(1)}pp` : "—"}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{a.gap.note}</div>
                    {a.gap.acceleration && (
                      <div className="mt-2 rounded border border-primary/30 bg-primary/10 p-2 text-[10px] text-primary">
                        Earnings Acceleration Expected — Forward PE lebih rendah dari PE TTM × 0.85.
                      </div>
                    )}
                  </div>

                  {/* E — Revenue Concentration HHI (lazy) */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Konsentrasi Pendapatan (HHI)
                      </div>
                      <HHIPanel symbol={a.symbol} enabled={showSegments} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <button
            onClick={() => setShowSegments((v) => !v)}
            disabled={peers.length === 0}
            className="text-[10px] text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showSegments ? "Sembunyikan" : "Muat"} detail segmentasi pendapatan (1 kredit/simbol)
          </button>
          <span className="text-[10px] text-muted-foreground">
            Algoritma 2, 3, 4 · Gap 2 · Bagian 2 A/B/E
          </span>
        </div>
      </Panel>
    </div>
  );
}

/**
 * Plain-language explanations for every Piotroski (F1–F9) and Altman (X1–X4)
 * component. The algorithm hands us the raw value (e.g. "ROA 2.1%") but nothing
 * explaining WHAT the metric is or WHY it matters, which made the Financial
 * Safety card unreadable for non-accountants.
 *
 * Each entry = what it measures + how to read it. Rendered on hover via
 * MethodTip so the table itself stays compact.
 */
const METRIC_EXPLAIN: Record<string, string> = {
  // ── Piotroski F-Score components ────────────────────────────────────────
  F1: "ROA (Return on Assets) = laba bersih ÷ total aset. Mengukur seberapa efisien perusahaan mengubah seluruh asetnya (pabrik, tanah, kas, piutang) menjadi laba. Poin 1 jika positif — perusahaan untung. Semakin tinggi semakin baik.",
  F2: "Arus Kas Operasi (CFO) = uang tunai yang benar-benar masuk dari kegiatan utama bisnis (jualan), bukan dari utang atau jual aset. Poin 1 jika positif. Ini penting karena laba bisa 'dimanipulasi' secara akuntansi, tapi uang kas tidak —CFO positif berarti perusahaan benar-benar menghasilkan uang.",
  F3: "ROA naik dibanding tahun lalu. Poin 1 jika membaik. Menandakan efisiensi perusahaan sedang meningkat, bukan sekadar untung sesaat karena satu kejadian.",
  F4: "Akrual = selisih antara laba akuntansi dan uang kas yang benar-benar masuk. Poin 1 jika NEGATIF (kas lebih besar dari laba yang dicatat). Ini kualitas laba: perusahaan yang labanya tinggi tapi uang kasnya seret sedang memberi sinyal bahaya.",
  F5: "Leverage (DER = utang ÷ ekuitas) turun dibanding tahun lalu. Poin 1 jika utang berkurang relatif terhadap modal sendiri. Utang yang menurun = perusahaan makin aman dari risiko gagal bayar.",
  F6: "Current ratio = aset lancar ÷ utang lancar. Mengukur sanggup tidaknya perusahaan bayar tagihan jangka pendek (≤1 tahun) dengan harta yang bisa jadi uang cepat (kas, piutang, persediaan). Naik = likuiditas membaik.",
  F7: "Poin 1 jika jumlah saham beredar tidak bertambah (tidak ada dilusi). Kalau perusahaan menerbitkan saham baru, kepemilikanmu sebagai pemegang saham lama akan 'tercairkan' nilainya.",
  F8: "Margin kotor = (pendapatan − harga pokok penjualan) ÷ pendapatan. Menunjukkan berapa persen pendapatan yang tersisa setelah biaya produksi barang/jasa. Naik = perusahaan makinUntung di level operasi inti atau sedang bisa menaikkan harga.",
  F9: "Perputaran aset = pendapatan ÷ total aset. Mengukur berapa rupiah penjualan yang dihasilkan dari tiap 1 rupiah aset. Naik = aset digunakan lebih produktif (misal pabrik atau toko makin laris).",

  // ── Altman Z-Score components ──────────────────────────────────────────
  X1: "Modal kerja / total aset. Modal kerja = aset lancar − utang lancar, alias 'napas' keuangan jangka pendek. Semakin besar porsinya terhadap total aset, perusahaan makin punya ruang bernapas untuk operasi sehari-hari. Bobot terbesar di Altman (×6.56).",
  X2: "Laba ditahan / total aset. Laba ditahan adalah akumulasi laba yang tidak dibagikan sebagai dividen dan dipakai lagi untuk mengembangkan usaha. Ini ukuran usia & kematangan: perusahaan muda biasanya nilainya kecil, yang sudah mapan besar.",
  X3: "EBIT / total aset. EBIT = laba sebelum bunga dan pajak — murni kemampuan operasi mencetak laba, tanpa distorsi cara perusahaan berutang atau aturan pajak. Ini prediktor terkuat kebangkrutan (bobot ×6.72).",
  X4: "Ekuitas / total liabilitas (atau / ATMR untuk bank). Semacam 'bantalan' modal: kalau perusahaan rugi, berapa besar porsi modal pemilik dibanding kewajiban. Untuk bank memakai ATMR (aset tertimbang menurut risiko) karena neraka bank berbeda dari perusahaan biasa.",
};

/** Tooltip text: plain-language explanation, then the computed value. */
const METRIC_TIP = (id: string, value: string): string => {
  const base = METRIC_EXPLAIN[id];
  const suffix = value && value !== "—" ? `\n\nNilai saat ini: ${value}` : "";
  return (base ?? "Tidak ada penjelasan tersedia.") + suffix;
};

function ratioNum(
  ratios: Array<Record<string, unknown>>,
  year: string,
  group: string,
  key: string,
): number | null {
  const hit = ratios.find((r) => String(r["year"]) === year);
  if (!hit) return null;
  const g = hit[group];
  if (!g || typeof g !== "object") return null;
  const v = (g as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Lazy HHI panel — fetches /company/get-segments/{symbol}/ only when open. */
function HHIPanel({ symbol, enabled }: { symbol: string; enabled: boolean }) {
  const q = useRevenueSegments(enabled ? symbol : null, enabled);
  const conc = q.data ? revenueConcentration(q.data.revenue_breakdown ?? null) : null;

  if (!enabled) return <span className="text-[10px] text-muted-foreground">—</span>;
  if (q.isPending) return <Skeleton className="h-4 w-20" />;
  if (q.isError) return <span className="text-[10px] text-muted-foreground">Gagal</span>;

  const tone: Tone =
    conc?.hhi == null
      ? "neutral"
      : conc.hhi > 0.5
        ? "warning"
        : conc.hhi >= 0.25
          ? "accent"
          : "positive";
  return (
    <div className="w-full">
      <div className="flex items-center justify-end">
        <Tag tone={tone}>{conc?.label ?? "—"}</Tag>
      </div>
      <div className="mt-1 text-right text-xl font-semibold">
        {conc?.hhi != null ? conc.hhi.toFixed(2) : "—"}
      </div>
      <div className="mt-1 text-right text-[10px] text-muted-foreground">{conc?.note}</div>
      {conc && conc.segments.length > 0 && (
        <div className="mt-2 space-y-1">
          {conc.segments.slice(0, 5).map((s) => (
            <div key={s.name} className="flex items-center justify-between text-[10px]">
              <span className="truncate text-muted-foreground">{s.name}</span>
              <span className="ml-2 tabular-nums">{(s.share * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// 4. NEWS INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────
export function NewsIntelligence() {
  const [sectorFilter, setSectorFilter] = useState("Semua");
  const [tagFilter, setTagFilter] = useState("Semua");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<NewsArticle | null>(null);

  // Use limit=8 to share the exact same TanStack Query cache key as the
  // dashboard (MarketOverview) — zero extra API credits when navigating here.
  const newsFeed = useIdxNews(8);
  const articles = useMemo(() => newsFeed.data ?? [], [newsFeed.data]);

  // Derive unique sectors from live data for the sector filter
  const sectors = useMemo(
    () => [
      "Semua",
      ...Array.from(new Set(articles.map((n) => n.sector).filter(Boolean) as string[])),
    ],
    [articles],
  );

  const filtered = useMemo(
    () =>
      articles.filter(
        (n) =>
          (sectorFilter === "Semua" || n.sector === sectorFilter) &&
          (tagFilter === "Semua" || (n.tags ?? []).includes(tagFilter)) &&
          (!query || n.title.toLowerCase().includes(query.toLowerCase())),
      ),
    [articles, sectorFilter, tagFilter, query],
  );

  // Sector distribution for sidebar
  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    articles.forEach((n) => {
      if (n.sector) counts[n.sector] = (counts[n.sector] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [articles]);

  // Tag distribution for sidebar — top tags across all articles
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    articles.forEach((n) => {
      (n.tags ?? []).forEach((t) => {
        counts[t] = (counts[t] ?? 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [articles]);

  const activeFilters = [
    sectorFilter !== "Semua" && sectorFilter,
    tagFilter !== "Semua" && tagFilter,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <PageHeader title="Intelijen Berita">
        <ExportMenu title="News Catalyst Analysis" />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Panel
            title="Feed Berita"
            kicker="Berita pasar IDX terbaru"
            action={
              <div className="flex items-center gap-2">
                {activeFilters.map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      if (f === sectorFilter) setSectorFilter("Semua");
                      else setTagFilter("Semua");
                    }}
                    className="inline-flex items-center"
                  >
                    <Tag tone="accent">
                      {f} <X className="ml-1 inline size-2.5" />
                    </Tag>
                  </button>
                ))}
                {newsFeed.isFetching ? (
                  <RefreshCw className="size-3 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {filtered.length} berita
                  </span>
                )}
              </div>
            }
          >
            <div className="flex flex-wrap gap-2 border-b border-border p-3">
              <div className="relative min-w-44 flex-1">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari judul berita…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="h-8 border border-input bg-background px-2 text-xs"
              >
                {sectors.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            {newsFeed.isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded bg-secondary/50" />
                ))}
              </div>
            ) : newsFeed.isError ? (
              <div className="p-10 text-center text-xs text-muted-foreground">
                Berita tidak dapat dimuat.
              </div>
            ) : (
              <div>
                {filtered.length === 0 && (
                  <div className="p-10 text-center text-xs text-muted-foreground">
                    Tidak ada berita yang cocok dengan filter aktif.
                  </div>
                )}
                {filtered.map((n, i) => (
                  <button
                    key={`${n.timestamp}-${i}`}
                    onClick={() => setDetail(n)}
                    className="grid w-full gap-3 border-b border-border px-4 py-4 text-left hover:bg-secondary/50 md:grid-cols-[60px_1fr_auto]"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {n.timestamp?.slice(11, 16)}
                    </span>
                    <div>
                      <div className="text-sm leading-5">{n.title}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(n.symbols ?? []).length > 0 && (
                          <span className="text-[10px] font-semibold text-primary">
                            {n
                              .symbols!.slice(0, 3)
                              .map((s) => s.replace(".JK", ""))
                              .join(", ")}
                          </span>
                        )}
                        {n.sector && (
                          <span className="text-[10px] text-muted-foreground">{n.sector}</span>
                        )}
                        {n.timestamp && (
                          <span className="text-[10px] text-muted-foreground">
                            {n.timestamp.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 flex-wrap justify-end">
                      {(n.tags ?? []).slice(0, 2).map((t) => (
                        <Tag key={t} tone="accent">
                          {t}
                        </Tag>
                      ))}
                      <ChevronRight className="size-4 text-muted-foreground self-center" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="space-y-4">
          {/* ── Distribusi Sektor: clickable filter ── */}
          <Panel title="Distribusi Sektor" kicker="(Klik untuk filter)">
            <div className="divide-y divide-border">
              {newsFeed.isPending ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-secondary/50" />
                  ))}
                </div>
              ) : sectorCounts.length === 0 ? (
                <p className="p-4 text-[10px] text-muted-foreground">Tidak ada data.</p>
              ) : (
                sectorCounts.map(([sector, count]) => {
                  const pct = articles.length > 0 ? Math.round((count / articles.length) * 100) : 0;
                  const isActive = sectorFilter === sector;
                  return (
                    <button
                      key={sector}
                      onClick={() => setSectorFilter(isActive ? "Semua" : sector)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive
                          ? "border-l-2 border-primary bg-primary/8 text-primary"
                          : "border-l-2 border-transparent hover:bg-secondary/70 hover:border-border hover:text-primary",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex justify-between text-xs">
                          <span
                            className={cn(
                              "truncate max-w-[130px]",
                              isActive ? "font-semibold" : "text-foreground",
                            )}
                          >
                            {sector}
                          </span>
                          <span
                            className={cn(
                              "tabular-nums shrink-0 ml-2",
                              isActive ? "text-primary" : "text-muted-foreground",
                            )}
                          >
                            {count} · {pct}%
                          </span>
                        </div>
                        <Bar value={pct} tone={isActive ? "positive" : "accent"} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Panel>

          {/* ── Distribusi Tags: top tags, clickable filter ── */}
          <Panel title="Distribusi Tags" kicker="(Klik untuk filter)">
            <div className="divide-y divide-border">
              {newsFeed.isPending ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-secondary/50" />
                  ))}
                </div>
              ) : tagCounts.length === 0 ? (
                <p className="p-4 text-[10px] text-muted-foreground">Tidak ada data.</p>
              ) : (
                tagCounts.map(([tag, count]) => {
                  const isActive = tagFilter === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => setTagFilter(isActive ? "Semua" : tag)}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-2.5 text-xs transition-colors",
                        isActive
                          ? "border-l-2 border-primary bg-primary/8 text-primary font-semibold"
                          : "border-l-2 border-transparent text-foreground hover:bg-secondary/70 hover:border-border hover:text-primary",
                      )}
                    >
                      <span className="truncate max-w-[170px] text-left">{tag}</span>
                      <span
                        className={cn(
                          "ml-2 shrink-0 tabular-nums rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </Panel>
        </div>
      </div>
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle>Detail Berita</SheetTitle>
            <SheetDescription>{detail?.title}</SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-4">
                {detail.sector && meta("Sektor", detail.sector)}
                {(detail.sub_sector ?? []).length > 0 &&
                  meta("Sub-sektor", detail.sub_sector!.join(", "))}
                {(detail.symbols ?? []).length > 0 &&
                  meta("Emiten", detail.symbols!.map((s) => s.replace(".JK", "")).join(", "))}
                {detail.timestamp && meta("Waktu", detail.timestamp.replace("T", " ").slice(0, 16))}
              </div>
              {detail.body && (
                <div className="border-l-2 border-primary bg-accent/40 p-4">
                  <InsightLabel>Ringkasan</InsightLabel>
                  <p className="mt-2 text-xs leading-5">{detail.body}</p>
                </div>
              )}
              {(detail.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags!.map((t) => (
                    <Tag key={t} tone="accent">
                      {t}
                    </Tag>
                  ))}
                </div>
              )}
              {detail.source && (
                <a
                  href={detail.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                >
                  Baca artikel lengkap <ChevronRight className="size-3" />
                </a>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DECISION SCREENER
// ─────────────────────────────────────────────────────────────────────────────
export function DecisionScreener() {
  const [minShi, setMinShi] = useState(60);
  const [minSafety, setMinSafety] = useState(60);
  const [classification, setClassification] = useState("Semua");
  const [activeFlags, setActiveFlags] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState<CompanyKey>("safety");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const flagDefs: [string, (c: Company) => boolean][] = [
    ["Pertumbuhan > 8%", (c) => c.growth > 8],
    ["Margin > 15%", (c) => c.margin > 15],
    ["Utang < 50%", (c) => c.debt < 50],
    ["Dividen > 4%", (c) => c.dividend > 4],
    ["Tidak ada anomali", (c) => !c.anomaly],
    ["P/E < 20x", (c) => c.pe > 0 && c.pe < 20],
  ];

  const toggleFlag = (f: string) =>
    setActiveFlags((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const result = useMemo(() => {
    const list = companies.filter(
      (c) =>
        c.shi >= minShi &&
        c.safety >= minSafety &&
        (classification === "Semua" || classify(c) === classification) &&
        activeFlags.every((f) => {
          const def = flagDefs.find(([label]) => label === f);
          return def ? def[1](c) : true;
        }),
    );
    return [...list].sort((a, b) =>
      sortDir === "desc" ? b[sortCol] - a[sortCol] : a[sortCol] - b[sortCol],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minShi, minSafety, classification, activeFlags, sortCol, sortDir]);

  function toggleSort(k: CompanyKey) {
    if (sortCol === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortCol(k);
      setSortDir("desc");
    }
  }

  const SortIcon = ({ k }: { k: CompanyKey }) =>
    sortCol === k ? (
      sortDir === "desc" ? (
        <ChevronDown className="ml-1 inline size-3 text-primary" />
      ) : (
        <ChevronUp className="ml-1 inline size-3 text-primary" />
      )
    ) : (
      <ArrowDownUp className="ml-1 inline size-3 opacity-30" />
    );

  const matrices: [string, string, Tone][] = [
    ["Undervalued Quality", "P/E ≤ 14x · margin ≥ 20% · safety ≥ 75", "positive"],
    ["Growth at Reasonable Price", "Pertumbuhan ≥ 12% · P/E ≤ 22x", "accent"],
    ["Dividend Trap Alert", "Yield ≥ 7% · safety < 65", "warning"],
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Screener Keputusan">
        <span className="text-[10px] text-muted-foreground">{result.length} emiten cocok</span>
        <ExportMenu title="Decision Matrix Results" />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[310px_1fr]">
        <Panel title="Faktor Screening" kicker="Konfigurasi aturan">
          <div className="p-4">
            <Range label="SHI Minimum" value={minShi} set={setMinShi} />
            <Range label="Keamanan finansial" value={minSafety} set={setMinSafety} />
            <label className="mt-5 block text-[10px] uppercase text-muted-foreground">
              Klasifikasi
            </label>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              className="mt-2 h-9 w-full border border-input bg-background px-2 text-xs"
            >
              <option>Semua</option>
              <option>Undervalued Quality</option>
              <option>Growth at Reasonable Price</option>
              <option>Dividend Trap Alert</option>
              <option>Balanced Fundamentals</option>
            </select>
            <div className="mt-5">
              <div className="mb-2 text-[10px] uppercase text-muted-foreground">
                Filter tambahan
              </div>
              <div className="grid grid-cols-2 gap-2">
                {flagDefs.map(([label]) => (
                  <label
                    key={label}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 border p-2 text-[10px] transition-colors",
                      activeFlags.includes(label)
                        ? "border-primary/50 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-border/80",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={activeFlags.includes(label)}
                      onChange={() => toggleFlag(label)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {(activeFlags.length > 0 || classification !== "Semua") && (
              <button
                onClick={() => {
                  setActiveFlags([]);
                  setClassification("Semua");
                }}
                className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-negative transition-colors"
              >
                <RefreshCw className="size-3" />
                Reset semua filter
              </button>
            )}
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
              Klasifikasi analitis deterministik. Tidak menghasilkan instruksi perdagangan.
            </p>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Matriks Keputusan Multi-Faktor" kicker="Klasifikasi yang dapat dijelaskan">
            <div className="grid gap-px bg-border md:grid-cols-3">
              {matrices.map(([a, b, t]) => (
                <button
                  key={a}
                  onClick={() => setClassification(classification === a ? "Semua" : a)}
                  className={cn(
                    "bg-card p-4 text-left hover:bg-secondary transition-colors",
                    classification === a && "ring-1 ring-primary/40",
                  )}
                >
                  <Tag tone={t}>{a}</Tag>
                  <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{b}</p>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {companies.filter((c) => classify(c) === a).length} emiten cocok
                  </div>
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            title="Hasil Screening"
            kicker="Dihitung dari aturan aktif"
            action={
              <span className="text-[10px] text-muted-foreground">{result.length} cocok</span>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-235">
                <thead>
                  <tr>
                    <th className={th}>Ticker</th>
                    <th className={th}>Emiten</th>
                    <th className={th}>Sektor</th>
                    <th
                      className={cn(th, "cursor-pointer hover:text-foreground")}
                      onClick={() => toggleSort("shi")}
                    >
                      SHI <SortIcon k="shi" />
                    </th>
                    <th
                      className={cn(th, "cursor-pointer hover:text-foreground")}
                      onClick={() => toggleSort("growth")}
                    >
                      Pertumbuhan <SortIcon k="growth" />
                    </th>
                    <th
                      className={cn(th, "cursor-pointer hover:text-foreground")}
                      onClick={() => toggleSort("safety")}
                    >
                      Keamanan <SortIcon k="safety" />
                    </th>
                    <th
                      className={cn(th, "cursor-pointer hover:text-foreground")}
                      onClick={() => toggleSort("pe")}
                    >
                      P/E <SortIcon k="pe" />
                    </th>
                    <th
                      className={cn(th, "cursor-pointer hover:text-foreground")}
                      onClick={() => toggleSort("dividend")}
                    >
                      Dividen <SortIcon k="dividend" />
                    </th>
                    <th className={th}>Klasifikasi</th>
                    <th className={th}>Pantau</th>
                  </tr>
                </thead>
                <tbody>
                  {result.map((c) => {
                    const cl = classify(c);
                    const tone: Tone =
                      cl === "Dividend Trap Alert"
                        ? "warning"
                        : cl === "Undervalued Quality"
                          ? "positive"
                          : "accent";
                    return (
                      <tr key={c.ticker} className="hover:bg-secondary/50">
                        <td className={cn(td, "font-semibold text-primary")}>{c.ticker}</td>
                        <td className={td}>{c.name}</td>
                        <td className={td}>{c.sector}</td>
                        <td className={td}>
                          <Score value={c.shi} />
                        </td>
                        <td className={td}>
                          <Change value={c.growth} />
                        </td>
                        <td className={td}>
                          <Score value={c.safety} />
                        </td>
                        <td className={td}>{c.pe || "NM"}x</td>
                        <td className={td}>{c.dividend}%</td>
                        <td className={td}>
                          <Tag tone={tone}>{cl}</Tag>
                        </td>
                        <td className={td}>
                          <WatchlistToggle ticker={c.ticker} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {result.length === 0 && (
                <div className="p-10 text-center text-xs text-muted-foreground">
                  Tidak ada emiten yang cocok dengan threshold saat ini. Coba turunkan nilai
                  minimum.
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Bagian 2 A: Free Float & Liquidity Risk ─────────────────────── */}
      <FreeFloatScreener />

      {/* ── Bagian 2 C: ESG Momentum Tier ───────────────────────────────── */}
      <EsgScreener />
    </div>
  );
}
// ── Bagian 2 A: Free Float & Liquidity Risk (Screener) ─────────────────────
/**
 * One /v2/free-float/ call returns the whole IDX (961 rows, 1 credit, cached
 * 24h), so we pull it once and rank/filter locally instead of per-symbol.
 */
function FreeFloatScreener() {
  const ff = useFreeFloatMap();
  const [maxFloat, setMaxFloat] = useState(100);

  const rows = useMemo(() => {
    const map = ff.data;
    if (!map) return [];
    return [...map.entries()]
      .map(([symbol, free_float]) => ({ symbol, risk: classifyFreeFloat(free_float, null) }))
      .filter((r) => r.risk.freeFloat != null && r.risk.freeFloat * 100 <= maxFloat)
      .sort((a, b) => (a.risk.freeFloat ?? 1) - (b.risk.freeFloat ?? 1))
      .slice(0, 50);
  }, [ff.data, maxFloat]);

  return (
    <Panel
      title="Free Float & Risiko Likuiditas"
      kicker="Bagian 2 A · seluruh IDX · 1 kredit, cache 24j"
      action={
        <MethodTip text="Free Float <15% → Low Float (hati-hati manipulasi harga). 15–35% → Float Terbatas (volume kecil menggerakkan harga). ≥35% → Float Sehat. Trigger: Free Float <20% AND Volume 30d < median sektor → Liquidity Cliff." />
      }
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <label className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground">
          Tampilkan free float ≤
          <input
            type="range"
            min={1}
            max={100}
            value={maxFloat}
            onChange={(e) => setMaxFloat(Number(e.target.value))}
            className="w-40 accent-primary"
          />
          <span className="w-10 text-foreground">{maxFloat}%</span>
        </label>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {ff.isPending
            ? "Memuat…"
            : ff.isError
              ? "Gagal memuat"
              : `${rows.length} dari ${ff.data?.size ?? 0} emiten`}
        </span>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-card">
            <tr>
              <th className={th}>Ticker</th>
              <th className={th}>Free Float</th>
              <th className={th}>Klasifikasi</th>
              <th className={th}>Flag</th>
            </tr>
          </thead>
          <tbody>
            {ff.isPending && (
              <tr>
                <td className={td} colSpan={4}>
                  <Skeleton className="h-6 w-full" />
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.symbol} className="hover:bg-secondary/50">
                <td className={cn(td, "font-semibold text-primary")}>{r.symbol}</td>
                <td className={cn(td, "tabular-nums")}>{(r.risk.freeFloat! * 100).toFixed(2)}%</td>
                <td className={td}>
                  <Tag tone={floatTone(r.risk.level)}>{r.risk.label}</Tag>
                </td>
                <td className={td}>
                  {r.risk.liquidityCliff ? (
                    <span className="text-[10px] text-negative">Liquidity Cliff</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Bagian 2 C: ESG Momentum Tier (Screener) ───────────────────────────────
/**
 * /v2/companies/ max page = 30 rows, so the full ~960 universe is ~32 pages.
 * We load one page (1 credit) by default and let the user pull more.
 */
function EsgScreener() {
  const [pages, setPages] = useState(1);
  const esg = useEsgScores(pages, true);

  const rows = useMemo(
    () =>
      esg.data.filter((r): r is { ticker: string; name: string; score: number } => r.score != null),
    [esg.data],
  );

  return (
    <Panel
      title="ESG Momentum Tier"
      kicker="Bagian 2 C · 1 kredit / 30 emiten"
      action={
        <MethodTip text="ESG Leader >70 · ESG Follower 50–70 · ESG Laggard ≤50. Bukan rekomendasi investasi." />
      }
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="text-[10px] uppercase text-muted-foreground">
          {esg.isPending
            ? "Memuat…"
            : esg.isError
              ? "Gagal memuat"
              : `${rows.length} emiten berskor ESG`}
        </span>
        <button
          onClick={() => setPages((p) => p + 1)}
          disabled={esg.isPending}
          className="ml-auto text-[10px] text-primary hover:underline disabled:opacity-40"
        >
          Muat 30 berikutnya (1 kredit)
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-card">
            <tr>
              <th className={th}>Ticker</th>
              <th className={th}>Emiten</th>
              <th className={th}>ESG Score</th>
              <th className={th}>Tier</th>
            </tr>
          </thead>
          <tbody>
            {esg.isPending && (
              <tr>
                <td className={td} colSpan={4}>
                  <Skeleton className="h-6 w-full" />
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const t = classifyEsg(r.score);
              return (
                <tr key={r.ticker} className="hover:bg-secondary/50">
                  <td className={cn(td, "font-semibold text-primary")}>{r.ticker}</td>
                  <td className={cn(td, "max-w-70 truncate")}>{r.name}</td>
                  <td className={cn(td, "tabular-nums")}>{r.score.toFixed(2)}</td>
                  <td className={td}>
                    <Tag tone={esgTone(t.tier)}>{t.label}</Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Range({ label, value, set }: { label: string; value: number; set: (v: number) => void }) {
  return (
    <label className="mb-5 block">
      <div className="mb-2 flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-primary font-medium">{value}</span>
      </div>
      <input
        className="w-full accent-primary"
        type="range"
        min="30"
        max="95"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>30</span>
        <span>95</span>
      </div>
    </label>
  );
}
function WatchlistToggle({ ticker }: { ticker: string }) {
  const { has, add, remove } = useWatchlistStore();
  const inList = has(ticker);
  return (
    <button
      onClick={() => (inList ? remove(ticker) : add(ticker))}
      className={cn(
        "rounded p-1 transition-colors",
        inList ? "text-primary" : "text-muted-foreground hover:text-primary",
      )}
      title={inList ? "Hapus dari pantauan" : "Tambah ke pantauan"}
    >
      <Star className={cn("size-3.5", inList && "fill-current")} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WATCHLIST
// ─────────────────────────────────────────────────────────────────────────────
export function Watchlist() {
  const { entries, remove, updateNote, setAlert, add } = useWatchlistStore();
  const [editNote, setEditNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [addTicker, setAddTicker] = useState("");
  const [addError, setAddError] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editNote) noteRef.current?.focus();
  }, [editNote]);

  const list = useMemo(
    () =>
      entries.map((e) => {
        const company = companies.find((c) => c.ticker === e.ticker);
        return { ...e, company };
      }),
    [entries],
  );

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = addTicker.trim().toUpperCase();
    if (!t) return;
    const exists = companies.find((c) => c.ticker === t);
    if (!exists) {
      setAddError(`Ticker "${t}" tidak ditemukan di data.`);
      return;
    }
    add(t);
    setAddTicker("");
    setAddError("");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Daftar Pantauan">
        <form onSubmit={handleAdd} className="flex gap-2">
          <div className="relative">
            <Input
              value={addTicker}
              onChange={(e) => {
                setAddTicker(e.target.value.toUpperCase());
                setAddError("");
              }}
              placeholder="Ticker (mis. BBCA)"
              className="h-8 w-36 text-xs uppercase"
              maxLength={8}
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            <Plus className="size-3.5" />
            Tambah
          </Button>
        </form>
        <ExportMenu title="Watchlist Insights" />
      </PageHeader>
      {addError && (
        <div className="flex items-center gap-2 rounded border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
          <CircleAlert className="size-4 shrink-0" />
          {addError}
        </div>
      )}
      {entries.length === 0 ? (
        <Panel title="Daftar Pantauan Kosong">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <StarOff className="size-12 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-foreground">Belum ada emiten dipantau</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tambahkan ticker di atas, atau klik ikon bintang di tabel Screener / Terminal
                Emiten.
              </p>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Ringkasan Pantauan" kicker="Kondisi dipantau">
            <div className="overflow-x-auto">
              <table className="w-full min-w-215">
                <thead>
                  <tr>
                    {[
                      "Ticker",
                      "Emiten",
                      "Harga",
                      "Perubahan",
                      "SHI",
                      "Keamanan",
                      "Anomali",
                      "Ditambahkan",
                      "Aksi",
                    ].map((x) => (
                      <th className={th} key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.ticker} className="hover:bg-secondary/50">
                      <td className={cn(td, "font-semibold text-primary")}>{e.ticker}</td>
                      <td className={td}>{e.company?.name ?? "—"}</td>
                      <td className={td}>{e.company ? formatIDR(e.company.price) : "—"}</td>
                      <td className={td}>
                        {e.company ? <Change value={e.company.change} /> : "—"}
                      </td>
                      <td className={td}>{e.company?.shi ?? "—"}</td>
                      <td className={td}>{e.company ? <Score value={e.company.safety} /> : "—"}</td>
                      <td className={td}>
                        {e.company?.anomaly ? (
                          <Tag tone="warning">{e.company.anomaly}</Tag>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={cn(td, "text-muted-foreground text-[10px]")}>
                        {new Date(e.addedAt).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditNote(e.ticker);
                              setNoteValue(e.note);
                            }}
                            className="rounded p-1 text-muted-foreground hover:text-primary transition-colors"
                            title="Edit catatan"
                          >
                            <BookOpen className="size-3.5" />
                          </button>
                          <button
                            onClick={() => remove(e.ticker)}
                            className="rounded p-1 text-muted-foreground hover:text-negative transition-colors"
                            title="Hapus dari pantauan"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          {/* Research notes */}
          <Panel title="Catatan Riset" kicker="Per emiten">
            <div className="divide-y divide-border">
              {list.map((e) => (
                <div key={e.ticker} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary">{e.ticker}</span>
                    <button
                      onClick={() => {
                        setEditNote(e.ticker);
                        setNoteValue(e.note);
                      }}
                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      {e.note ? "Edit catatan" : "+ Tambah catatan"}
                    </button>
                  </div>
                  {e.note ? (
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{e.note}</p>
                  ) : (
                    <p className="mt-1.5 text-[10px] italic text-muted-foreground/50">
                      Belum ada catatan.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
      {/* Note edit sheet */}
      <Sheet open={!!editNote} onOpenChange={(v) => !v && setEditNote(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle>Catatan: {editNote}</SheetTitle>
            <SheetDescription>Tambahkan konteks riset untuk {editNote}.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-5">
            <textarea
              ref={noteRef}
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Tulis catatan riset di sini…"
              className="min-h-36 w-full resize-y rounded border border-input bg-background p-3 text-xs outline-none focus:ring-1 focus:ring-primary/30"
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  if (editNote) {
                    updateNote(editNote, noteValue);
                    setEditNote(null);
                  }
                }}
              >
                Simpan Catatan
              </Button>
              <Button variant="outline" onClick={() => setEditNote(null)}>
                Batal
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. METHODOLOGY
// ─────────────────────────────────────────────────────────────────────────────
export function Methodology() {
  const [open, setOpen] = useState("shi");
  return (
    <div className="space-y-4">
      <PageHeader title="Metodologi" eyebrow="Intelijen yang dapat dijelaskan">
        <ExportMenu title="Sectors Terminal Methodology" />
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Panel title="Model Analitis">
          <div className="p-2">
            {methodology.map((m) => (
              <button
                onClick={() => setOpen(m.id)}
                key={m.id}
                className={cn(
                  "flex w-full items-center justify-between border-l-2 px-3 py-3 text-left text-xs",
                  open === m.id
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-transparent text-muted-foreground hover:bg-secondary",
                )}
              >
                <span>{m.name}</span>
                <ChevronRight className="size-3" />
              </button>
            ))}
          </div>
        </Panel>
        <div className="space-y-4">
          {methodology
            .filter((m) => m.id === open)
            .map((m) => (
              <Panel key={m.id} title={m.name} kicker="Metodologi kustom">
                <div className="p-5">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Yang diukur</div>
                      <p className="mt-2 text-sm leading-6">{m.purpose}</p>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Interpretasi
                      </div>
                      <p className="mt-2 text-sm leading-6">{m.interpretation}</p>
                    </div>
                  </div>
                  <div className="mt-6 border-t border-border pt-5">
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Indikator dan bobot
                    </div>
                    <div className="mt-3 grid gap-px bg-border sm:grid-cols-2">
                      {m.indicators.map((x, i) => (
                        <div key={x} className="flex items-center bg-card p-3">
                          <span className="mr-3 text-[10px] text-muted-foreground">0{i + 1}</span>
                          <span className="text-xs">{x}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 border-l-2 border-primary bg-accent/30 p-4">
                    <InsightLabel>Normalisasi dan kalkulasi</InsightLabel>
                    <p className="mt-2 text-xs leading-5">{m.formula}</p>
                  </div>
                </div>
              </Panel>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return (localStorage.getItem("theme") as "dark" | "light") || "dark";
    } catch {
      return "dark";
    }
  });
  const { entries, clear } = useWatchlistStore();

  const toggleTheme = (value: "dark" | "light") => {
    setTheme(value);
    localStorage.setItem("theme", value);
    const html = document.documentElement;
    html.classList.toggle("dark", value === "dark");
    html.classList.toggle("light", value === "light");
  };

  // Derived stats
  const apiKeyConfigured = !!import.meta.env["VITE_API_URL"];
  const dataMode = "PROTOTYPE";

  const cacheStats = [
    {
      label: "Redis",
      value: "Tidak tersambung",
      tone: "warning" as Tone,
      note: "Fallback in-memory aktif",
    },
    {
      label: "TanStack Query",
      value: "Aktif",
      tone: "positive" as Tone,
      note: "staleTime: 5 mnt · gcTime: 30 mnt",
    },
    {
      label: "Server cache",
      value: "Siap",
      tone: "positive" as Tone,
      note: "Menunggu koneksi Redis",
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Pengaturan" />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Preferensi Workspace">
          <div className="divide-y divide-border">
            {(
              [
                ["Pasar default", "Bursa Efek Indonesia (IDX)"],
                ["Format angka", "Locale Indonesia"],
                ["Zona waktu", "Asia/Jakarta (WIB)"],
                ["Kepadatan tampilan", "Terminal kompak"],
              ] as [string, string][]
            ).map(([a, b]) => (
              <div key={a} className="flex items-center justify-between px-4 py-3">
                <span className="text-xs">{a}</span>
                <span className="text-xs text-muted-foreground">{b}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-xs">Tampilan</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {theme === "light" ? "Mode terang aktif" : "Mode gelap aktif"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Gelap</span>
                <Switch
                  checked={theme === "light"}
                  onCheckedChange={(checked) => toggleTheme(checked ? "light" : "dark")}
                  aria-label="Toggle light mode"
                />
                <span className="text-[10px] text-muted-foreground">Terang</span>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Status Koneksi Data">
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-xs">
                  <Zap className="size-3.5 text-primary" />
                  Sectors API
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {apiKeyConfigured ? "API URL terkonfigurasi" : "Belum terkonfigurasi"}
                </div>
              </div>
              <Tag tone={dataMode === "PROTOTYPE" ? "warning" : "positive"}>{dataMode}</Tag>
            </div>
            {cacheStats.map((s) => (
              <div key={s.label} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <Database className="size-3.5 text-muted-foreground" />
                    {s.label}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{s.note}</div>
                </div>
                <Tag tone={s.tone}>{s.value}</Tag>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-xs">
                  <TrendingUp className="size-3.5 text-muted-foreground" />
                  Kredit API hari ini
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Gauge aktif saat API terhubung
                </div>
              </div>
              <Tag tone="neutral">0 / 500</Tag>
            </div>
          </div>
        </Panel>
      </div>
      <Panel title="Data & Penyimpanan">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-xs">Pantauan tersimpan</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {entries.length} emiten · disimpan di localStorage
              </div>
            </div>
            {entries.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clear}
                className="text-negative hover:border-negative/40 hover:bg-negative/10"
              >
                <Trash2 className="size-3.5" />
                Hapus semua
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-xs">Cache browser (TanStack Query)</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                In-memory · dibersihkan saat reload
              </div>
            </div>
            <Tag tone="neutral">In-memory</Tag>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-xs">Sesi auth</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                JWT · disimpan di localStorage + httpOnly cookie
              </div>
            </div>
            <Tag tone="positive">Aktif</Tag>
          </div>
        </div>
      </Panel>
      <Panel title="Informasi Mode">
        <div className="p-4 space-y-3">
          <div className="flex gap-3 border border-warning/30 bg-warning/5 p-3">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-xs leading-5 text-muted-foreground">
              Mode Prototype menggunakan data mock yang realistis. Skor kustom adalah model analitis
              independen dan bukan rating pasar resmi atau rekomendasi investasi.
            </p>
          </div>
          <div className="flex gap-3 border border-primary/20 bg-primary/5 p-3">
            <Layers className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">Strategi cache 6 lapis aktif:</span>{" "}
              Redis server cache · TanStack Query in-memory · Request deduplication · Morning
              prefetch cron · Smart invalidation · Credit budget monitor. Redis belum terhubung —
              menggunakan in-memory fallback.
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
