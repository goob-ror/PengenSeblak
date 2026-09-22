"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import {
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
  Search,
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
import { IHSGChart, SectorChart } from "./charts";
import {
  anomalies,
  classify,
  companies,
  dominanceScore,
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

// ── Small helpers ─────────────────────────────────────────────────────────────
const toneFor = (v: number): Tone => (v > 0 ? "positive" : v < 0 ? "negative" : "neutral");
const meta = (label: string, value: string) => (
  <div>
    <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    <div className="mt-1 text-xs text-foreground">{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. MARKET OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
export function MarketOverview() {
  const [period, setPeriod] = useState("1D");
  const [detail, setDetail] = useState<(typeof anomalies)[number] | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Ringkasan Pasar">
        <div className="text-[10px] text-muted-foreground">Market pulse · 22 Sep 2026</div>
        <ExportMenu title="Market Overview" />
      </PageHeader>
      <MetricStrip
        items={[
          { label: "IHSG", value: "7,412.86", sub: <Change value={0.82} /> },
          { label: "Day range", value: "7,352–7,428", sub: "76 point range" },
          {
            label: "Market status",
            value: <span className="text-positive">OPEN</span>,
            sub: "Sesi II · 01:28 tersisa",
          },
          {
            label: "Advancing",
            value: "318",
            sub: <span className="text-positive">51.6% breadth</span>,
          },
          {
            label: "Declining",
            value: "247",
            sub: <span className="text-negative">40.1% breadth</span>,
          },
          { label: "Turnover", value: "Rp 8.4T", sub: "0.94× pace 20H" },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[1.45fr_.85fr]">
        <Panel
          title="IHSG Intraday"
          kicker="Data pasar"
          action={
            <div className="flex">
              {["1D", "1W", "1M", "3M", "1Y"].map((x) => (
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
          }
        >
          <IHSGChart />
          <div className="flex gap-5 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span><i className="mr-1 inline-block size-1.5 bg-primary" />IHSG</span>
            <span>VWAP 7,391.20</span>
            <span className="ml-auto">Range: {period}</span>
          </div>
        </Panel>
        <Panel title="Heatmap Sektor" kicker="Performa relatif">
          <div className="divide-y divide-border">
            {sectors.map((s) => {
              const isPos = s.performance >= 0;
              const barWidth = Math.min(100, Math.abs(s.performance) * 25);
              return (
                <div
                  key={s.name}
                  className="grid grid-cols-[72px_1fr_64px] items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors"
                  title={`Market cap: Rp ${s.cap}T`}
                >
                  <span className="text-[10px] text-muted-foreground truncate">{s.code}</span>
                  <div className="min-w-0">
                    <div className="mb-1.5 text-xs font-medium">{s.name}</div>
                    <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", isPos ? "bg-positive/70" : "bg-negative/60")}
                        style={{ width: `${Math.max(3, barWidth)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right"><Change value={s.performance} /></div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Panel
          title="Sector Health Index"
          kicker="Skor turunan kustom"
          action={
            <MethodTip text="SHI menimbang pertumbuhan (40%), stabilitas margin (35%), dan kondisi utang (25%) di seluruh konstituen sektor." />
          }
        >
          <div className="divide-y divide-border">
            {sectorHealth.slice(0, 6).map((s, i) => {
              const tone = toneFor(s.score - 64);
              const barColor =
                tone === "positive" ? "bg-positive"
                : tone === "accent"  ? "bg-primary"
                : tone === "warning" ? "bg-warning"
                : "bg-negative";
              const scoreColor =
                tone === "positive" ? "text-positive"
                : tone === "accent"  ? "text-primary"
                : tone === "warning" ? "text-warning"
                : "text-negative";
              return (
                <div key={s.name} className="grid grid-cols-[28px_1fr_56px_auto] items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors">
                  <span className="text-[10px] tabular-nums text-muted-foreground">0{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium truncate">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{s.trend}</span>
                    </div>
                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${s.score}%` }} />
                    </div>
                    <div className="flex gap-3 mt-1.5 text-[9px] text-muted-foreground">
                      <span>G {s.growth}</span><span>M {s.margin}</span><span>D {s.debt}</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className={cn("text-xl font-semibold tabular-nums", scoreColor)}>{s.score}</span>
                  </div>
                  <Tag tone={tone}>{healthLabel(s.score)}</Tag>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel
          title="Monitor Anomali Pasar"
          kicker="Terdeteksi sistem"
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-negative/30 bg-negative/10 px-2 py-0.5 text-[10px] font-medium text-negative">
              <span className="size-1.5 rounded-full bg-negative animate-pulse" />
              {anomalies.length} aktif
            </span>
          }
        >
          <div className="divide-y divide-border">
            {anomalies.map((a) => (
              <button key={a.company + a.metric} onClick={() => setDetail(a)} className="w-full text-left hover:bg-secondary/50 transition-colors">
                <div className="flex items-stretch">
                  <div className={cn("w-1 shrink-0", a.severity === "High" ? "bg-negative" : "bg-warning")} />
                  <div className="flex flex-1 items-center gap-3 px-3 py-3">
                    <div className={cn("flex h-9 w-12 shrink-0 items-center justify-center border text-[11px] font-bold",
                      a.severity === "High" ? "border-negative/30 bg-negative/10 text-negative" : "border-warning/30 bg-warning/10 text-warning")}>
                      {a.company}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{a.insight}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {a.metric} <span className="text-foreground">{a.value}</span> · peer {a.average}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={cn("text-sm font-semibold tabular-nums", a.deviation >= 0 ? "text-positive" : "text-negative")}>
                        +{a.deviation}%
                      </div>
                      <Tag tone={a.severity === "High" ? "negative" : "warning"} className="mt-1">{a.severity}</Tag>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <InsightLabel>Analisis berbasis deviasi</InsightLabel>
            <span className="text-[10px] text-muted-foreground">Klik baris untuk detail</span>
          </div>
        </Panel>
      </div>
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle>Anomali {detail?.company}</SheetTitle>
            <SheetDescription>{detail?.insight}</SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="grid grid-cols-2 gap-5 p-5">
              {meta("Metrik", detail.metric)}
              {meta("Tingkat", detail.severity)}
              {meta("Nilai Emiten", detail.value)}
              {meta("Baseline Sektor", detail.average)}
              {meta("Deviasi", `+${detail.deviation}%`)}
              {meta("Interpretasi", "Diperlukan tinjauan konteks peer")}
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
type SortDir = "asc" | "desc";
type CompanyKey = keyof Pick<Company, "growth" | "margin" | "roe" | "debt" | "pe" | "safety" | "shi" | "dividend">;

export function SectorIntelligence() {
  const [sector, setSector] = useState("Financials");
  const [sortKey, setSortKey] = useState<CompanyKey>("safety");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");

  const selected = sectorHealth.find((s) => s.name === sector)!;
  const universe = useMemo(() => {
    let list = companies.filter((c) => c.sector === sector);
    if (query) list = list.filter((c) => (c.ticker + c.name).toLowerCase().includes(query.toLowerCase()));
    return [...list].sort((a, b) => sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]);
  }, [sector, sortKey, sortDir, query]);

  const sectorAnomalies = anomalies.filter((a) => a.sector === sector || universe.some((c) => c.ticker === a.company));

  function toggleSort(key: CompanyKey) {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortIcon = ({ k }: { k: CompanyKey }) =>
    sortKey === k
      ? sortDir === "desc" ? <ChevronDown className="ml-1 inline size-3 text-primary" /> : <ChevronUp className="ml-1 inline size-3 text-primary" />
      : <ArrowDownUp className="ml-1 inline size-3 opacity-30" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Intelijen Sektor">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari emiten…" className="h-8 w-44 pl-8 text-xs" />
        </div>
        <select value={sector} onChange={(e) => setSector(e.target.value)}
          className="h-8 border border-input bg-background px-3 text-xs">
          {sectors.map((s) => <option key={s.name}>{s.name}</option>)}
        </select>
        <Button variant="outline" size="sm"><ChevronDown className="size-3" /></Button>
        <ExportMenu title={`${sector} Sector Research`} />
      </PageHeader>
      <MetricStrip items={[
        { label: "Sektor terpilih", value: sector, sub: selected.code },
        { label: "Performa", value: <Change value={selected.performance} />, sub: "vs IHSG +0.82%" },
        { label: "Kesehatan Sektor", value: selected.score, sub: healthLabel(selected.score) },
        { label: "Tren", value: selected.trend, sub: "Komposit 20H" },
        { label: "Emiten", value: universe.length || 12, sub: "Universe IDX tercatat" },
        { label: "Market cap", value: `Rp ${selected.cap}T`, sub: "Agregat float-adjusted" },
      ]} />
      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <Panel title={`${sector} vs IHSG`} kicker="Performa terindeks">
          <SectorChart />
          <div className="flex gap-5 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span><i className="mr-1 inline-block size-1.5 bg-primary" />{sector}</span>
            <span><i className="mr-1 inline-block size-1.5 bg-muted-foreground" />IHSG</span>
          </div>
        </Panel>
        <Panel title="Breakdown Kesehatan Sektor" kicker="Terhitung"
          action={<MethodTip text="Skor komponen di-winsorisasi, dinormalisasi ke 0–100, lalu ditimbang: pertumbuhan 40%, stabilitas margin 35%, kondisi utang 25%." />}>
          <div className="p-5">
            <div className="flex items-end justify-between border-b border-border pb-4">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">SHI Komposit</div>
                <div className="mt-1 text-5xl font-semibold text-primary">{selected.score}</div>
              </div>
              <Tag tone="positive">{healthLabel(selected.score)}</Tag>
            </div>
            {([["Pertumbuhan", selected.growth, 40], ["Stabilitas Margin", selected.margin, 35], ["Kondisi Utang", selected.debt, 25]] as [string, number, number][]).map(([l, v, w]) => (
              <div className="mt-4" key={l}>
                <div className="mb-2 flex justify-between text-xs">
                  <span>{l}</span>
                  <span className="text-muted-foreground">{v} · bobot {w}%</span>
                </div>
                <Bar value={v} />
              </div>
            ))}
            {/* Ranked sector list */}
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-[10px] uppercase text-muted-foreground">Peringkat semua sektor</div>
              {sectorHealth.map((s, i) => (
                <button key={s.name} onClick={() => setSector(s.name)}
                  className={cn("flex w-full items-center justify-between py-1.5 text-xs transition-colors hover:text-primary",
                    s.name === sector ? "text-primary font-medium" : "text-muted-foreground")}>
                  <span className="flex items-center gap-2">
                    <span className="w-5 tabular-nums text-[10px]">{String(i + 1).padStart(2, "0")}</span>
                    {s.name}
                  </span>
                  <span className="tabular-nums">{s.score}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>
      <Panel title="Universe Emiten" kicker="Raw + kalkulasi"
        action={<span className="text-[10px] text-muted-foreground">{universe.length} emiten</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr>
                <th className={th}>Ticker</th>
                <th className={th}>Emiten</th>
                <th className={th}>Harga</th>
                <th className={th}>Ubah</th>
                <th className={th}>Mkt Cap</th>
                {(["growth", "margin", "debt", "pe"] as CompanyKey[]).map((k) => (
                  <th key={k} className={cn(th, "cursor-pointer hover:text-foreground")} onClick={() => toggleSort(k)}>
                    {k === "growth" ? "Pertumbuhan" : k === "margin" ? "Margin" : k === "debt" ? "Utang" : "P/E"}
                    <SortIcon k={k} />
                  </th>
                ))}
                <th className={cn(th, "cursor-pointer hover:text-foreground")} onClick={() => toggleSort("safety")}>
                  Kesehatan <SortIcon k="safety" />
                </th>
                <th className={th}>Anomali</th>
                <th className={th}>Pantau</th>
              </tr>
            </thead>
            <tbody>
              {(universe.length ? universe : companies.slice(0, 6)).map((c) => (
                <CompanyRow key={c.ticker} c={c} />
              ))}
            </tbody>
          </table>
          {universe.length === 0 && (
            <div className="p-10 text-center text-xs text-muted-foreground">Tidak ada emiten yang cocok dengan pencarian.</div>
          )}
        </div>
      </Panel>
      <Panel title="Divergensi Sektor" kicker="Insight tergenerate">
        {sectorAnomalies.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Tidak ada divergensi terdeteksi untuk sektor ini.</div>
        ) : (
          <div className="grid gap-px bg-border md:grid-cols-2">
            {sectorAnomalies.slice(0, 4).map((a) => (
              <div className="bg-card p-4" key={a.company}>
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-primary">{a.company} · {a.metric}</span>
                  <Tag tone={a.severity === "High" ? "negative" : "warning"}>{a.severity}</Tag>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {meta("Emiten", a.value)}
                  {meta("Rata-rata sektor", a.average)}
                  {meta("Deviasi", `+${a.deviation}%`)}
                </div>
                <div className="mt-4 border-l-2 border-primary pl-3 text-xs">{a.insight}</div>
              </div>
            ))}
          </div>
        )}
        {sectorAnomalies.length === 0 && (
          <div className="border-t border-border px-4 py-2.5">
            <InsightLabel>Semua emiten dalam batas normal peer</InsightLabel>
          </div>
        )}
      </Panel>
    </div>
  );
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
      <td className={td}><Change value={c.change} /></td>
      <td className={td}>Rp {c.marketCap}T</td>
      <td className={td}>{c.growth}%</td>
      <td className={td}>{c.margin}%</td>
      <td className={td}>{c.debt}%</td>
      <td className={td}>{c.pe || "NM"}x</td>
      <td className={td}><Score value={c.safety} /></td>
      <td className={td}>
        {c.anomaly ? <Tag tone="warning">{c.anomaly}</Tag> : <span className="text-muted-foreground">—</span>}
      </td>
      <td className={td}>
        <button onClick={() => inList ? remove(c.ticker) : add(c.ticker)}
          className={cn("rounded p-1 transition-colors", inList ? "text-primary hover:text-negative" : "text-muted-foreground hover:text-primary")}
          title={inList ? "Hapus dari pantauan" : "Tambah ke pantauan"}>
          {inList ? <Star className="size-3.5 fill-current" /> : <Star className="size-3.5" />}
        </button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPANY TERMINAL
// ─────────────────────────────────────────────────────────────────────────────
export function CompanyTerminal() {
  const [selected, setSelected] = useState(["BBCA", "BBRI", "BMRI"]);
  const [searchQ, setSearchQ] = useState("");
  const { has, add, remove } = useWatchlistStore();

  const peers = companies.filter((c) => selected.includes(c.ticker));
  const searchResults = useMemo(() => {
    if (!searchQ) return companies;
    return companies.filter((c) => (c.ticker + c.name + c.sector).toLowerCase().includes(searchQ.toLowerCase()));
  }, [searchQ]);

  const toggle = (t: string) =>
    setSelected((p) => p.includes(t) ? (p.length > 2 ? p.filter((x) => x !== t) : p) : p.length < 5 ? [...p, t] : p);

  const rows: [string, (c: Company) => string, string][] = [
    ["Pertumbuhan Pendapatan", (c) => `${c.growth}%`, "Pertumbuhan revenue year-on-year"],
    ["Profit Margin", (c) => `${c.margin}%`, "Net profit margin"],
    ["ROE", (c) => `${c.roe}%`, "Return on Equity"],
    ["Rasio Utang", (c) => `${c.debt}%`, "Debt-to-assets approximation"],
    ["Valuasi P/E", (c) => (c.pe ? `${c.pe}x` : "NM"), "Price-to-Earnings (NM = negatif/tidak bermakna)"],
    ["Dividend Yield", (c) => `${c.dividend}%`, "Yield dividen tahunan terakhir"],
    ["Performa Pasar", (c) => `${c.change}%`, "Perubahan harga hari ini"],
    ["SHI Sektor", (c) => `${c.shi}`, "Skor Sector Health Index sektor emiten ini"],
  ];

  // Best value per row for highlighting
  const bestValues = rows.map(([, get]) => {
    const vals = peers.map((c) => parseFloat(get(c)));
    return Math.max(...vals.filter((v) => !isNaN(v)));
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Terminal Emiten">
        <ExportMenu title="Peer Comparison" />
      </PageHeader>
      <Panel title="Pemilihan Peer" kicker="2–5 emiten"
        action={<span className="text-[10px] text-muted-foreground">{selected.length}/5 dipilih</span>}>
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Cari ticker atau nama emiten…" className="h-8 pl-8 text-xs" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {searchResults.slice(0, 12).map((c) => (
            <button key={c.ticker} onClick={() => toggle(c.ticker)}
              className={cn("flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-all",
                selected.includes(c.ticker)
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground")}>
              {selected.includes(c.ticker) ? <X className="size-3" /> : <Plus className="size-3" />}
              <span className="font-semibold">{c.ticker}</span>
              <span className="hidden text-[10px] sm:inline">{c.name.split(" ").slice(0, 2).join(" ")}</span>
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 2xl:grid-cols-[1.2fr_.8fr]">
        <Panel title="Matriks Komparasi Peer" kicker="Fundamental sebanding">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr>
                  <th className={th}>Indikator</th>
                  {peers.map((c) => (
                    <th className={th} key={c.ticker}>
                      <div className="text-primary">{c.ticker}</div>
                      <div className="mt-1 normal-case text-muted-foreground">{c.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, get, tooltip], rowIdx) => (
                  <tr key={label}>
                    <td className={cn(td, "text-muted-foreground")}>
                      <span className="flex items-center gap-1">
                        {label}
                        <MethodTip text={tooltip} />
                      </span>
                    </td>
                    {peers.map((c, colIdx) => {
                      const val = get(c);
                      const num = parseFloat(val);
                      const isBest = !isNaN(num) && num === bestValues[rowIdx] && peers.length > 1;
                      return (
                        <td key={c.ticker} className={cn(td, "text-base font-medium",
                          colIdx === 0 && "bg-accent/30",
                          isBest && "text-positive")}>
                          {val}
                          {isBest && <span className="ml-1 text-[9px] text-positive">▲ best</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Dominance Score" kicker="Perbandingan tertimbang kustom"
          action={<MethodTip text="Perbandingan berbasis persentil lintas-sektoral untuk peer terpilih, dengan utang dan valuasi dinilai terbalik. Bukan rekomendasi investasi." />}>
          <div className="p-4">
            {[...peers].sort((a, b) => dominanceScore(b) - dominanceScore(a)).map((c, i) => {
              const inList = has(c.ticker);
              return (
                <div key={c.ticker} className="border-b border-border py-4 first:pt-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-6 text-xs text-muted-foreground">0{i + 1}</span>
                    <span className="w-16 text-sm font-semibold">{c.ticker}</span>
                    <div className="flex-1"><Bar value={dominanceScore(c)} tone={i === 0 ? "positive" : "accent"} /></div>
                    <span className="ml-3 text-xl font-semibold text-data">{dominanceScore(c)}</span>
                    <button onClick={() => inList ? remove(c.ticker) : add(c.ticker)}
                      className={cn("rounded p-1 transition-colors", inList ? "text-primary" : "text-muted-foreground hover:text-primary")}>
                      <Star className={cn("size-3.5", inList && "fill-current")} />
                    </button>
                  </div>
                  <div className="ml-24 flex gap-3 text-[9px] text-muted-foreground">
                    <span>Pertumbuhan 20%</span><span>Profit 25%</span>
                    <span>ROE 15%</span><span>Risiko 15%</span>
                  </div>
                </div>
              );
            })}
            <div className="mt-4"><InsightLabel>Relatif terhadap peer yang dipilih</InsightLabel></div>
          </div>
        </Panel>
      </div>
      <Panel title="Keamanan & Distress Finansial" kicker="Analisis risiko turunan"
        action={
          <MethodTip text="Komposit yang terinspirasi prinsip distress-screening, disesuaikan untuk struktur sektor Indonesia. Skor 80–100: Resilien · 65–79: Stabil · 50–64: Pantau · <50: Risiko Tinggi." />
        }>
        <div className="grid gap-px bg-border md:grid-cols-3">
          {peers.map((c) => (
            <div className="bg-card p-5" key={c.ticker}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{c.ticker}</span>
                <ShieldCheck className={cn("size-4", c.safety >= 80 ? "text-positive" : c.safety >= 65 ? "text-warning" : "text-negative")} />
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Skor Keamanan</div>
                  <div className="text-4xl font-semibold">{c.safety}</div>
                </div>
                <Tag tone={c.safety >= 80 ? "positive" : c.safety >= 65 ? "warning" : "negative"}>
                  {c.safety >= 80 ? "Resilien" : c.safety >= 65 ? "Stabil" : "Pantau"}
                </Tag>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                {meta("Leverage", `${c.debt}%`)}
                {meta("Likuiditas", `${c.liquidity}/100`)}
                {meta("Profitabilitas", `${c.margin}%`)}
                {meta("Stabilitas", `${Math.round((c.safety + c.liquidity) / 2)}/100`)}
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Safety gauge</span><span>{c.safety}/100</span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full",
                    c.safety >= 80 ? "bg-positive" : c.safety >= 65 ? "bg-warning" : "bg-negative")}
                    style={{ width: `${c.safety}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. NEWS INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────
export function NewsIntelligence() {
  const [sentiment, setSentiment] = useState("Semua");
  const [catalyst, setCatalyst] = useState("Semua");
  const [impact, setImpact] = useState("Semua");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<(typeof news)[number] | null>(null);

  const catalysts = ["Semua", ...Array.from(new Set(news.map((n) => n.catalyst)))];
  const sentiments = ["Semua", "Positive", "Neutral", "Negative"];
  const impacts = ["Semua", "High", "Medium", "Low"];

  const filtered = useMemo(() =>
    news.filter((n) =>
      (sentiment === "Semua" || n.sentiment === sentiment) &&
      (catalyst === "Semua" || n.catalyst === catalyst) &&
      (impact === "Semua" || n.impact === impact) &&
      (!query || (n.headline + n.company + n.sector).toLowerCase().includes(query.toLowerCase()))
    ), [sentiment, catalyst, impact, query]);

  const sentimentCounts = { Positive: 0, Neutral: 0, Negative: 0 };
  news.forEach((n) => { if (n.sentiment in sentimentCounts) sentimentCounts[n.sentiment as keyof typeof sentimentCounts]++; });

  const activeFilters = [
    sentiment !== "Semua" && sentiment,
    catalyst !== "Semua" && catalyst,
    impact !== "Semua" && impact,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <PageHeader title="Intelijen Berita">
        <ExportMenu title="News Catalyst Analysis" />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Panel title="Feed Berita" kicker="Katalis terklasifikasi"
            action={
              <div className="flex items-center gap-2">
                {activeFilters.map((f) => (
                  <button key={f} onClick={() => {
                    if (f === sentiment) setSentiment("Semua");
                    else if (f === catalyst) setCatalyst("Semua");
                    else setImpact("Semua");
                  }} className="inline-flex items-center">
                    <Tag tone="accent">
                      {f} <X className="ml-1 inline size-2.5" />
                    </Tag>
                  </button>
                ))}
                <span className="text-[10px] text-muted-foreground">{filtered.length} sinyal</span>
              </div>
            }>
            <div className="flex flex-wrap gap-2 border-b border-border p-3">
              <div className="relative min-w-44 flex-1">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Emiten, sektor, atau headline" className="h-8 pl-8 text-xs" />
              </div>
              <select value={sentiment} onChange={(e) => setSentiment(e.target.value)}
                className="h-8 border border-input bg-background px-2 text-xs">
                {sentiments.map((x) => <option key={x}>{x}</option>)}
              </select>
              <select value={catalyst} onChange={(e) => setCatalyst(e.target.value)}
                className="h-8 border border-input bg-background px-2 text-xs">
                {catalysts.map((x) => <option key={x}>{x}</option>)}
              </select>
              <select value={impact} onChange={(e) => setImpact(e.target.value)}
                className="h-8 border border-input bg-background px-2 text-xs">
                {impacts.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              {filtered.length === 0 && (
                <div className="p-10 text-center text-xs text-muted-foreground">
                  Tidak ada berita yang cocok dengan filter aktif.
                </div>
              )}
              {filtered.map((n) => (
                <button key={n.headline} onClick={() => setDetail(n)}
                  className="grid w-full gap-3 border-b border-border px-4 py-4 text-left hover:bg-secondary/50 md:grid-cols-[45px_1fr_260px]">
                  <span className="text-xs text-muted-foreground tabular-nums">{n.time}</span>
                  <div>
                    <div className="text-sm leading-5">{n.headline}</div>
                    <div className="mt-2 flex gap-2">
                      <span className="text-[10px] font-semibold text-primary">{n.company}</span>
                      <span className="text-[10px] text-muted-foreground">{n.sector} · {n.source}</span>
                    </div>
                  </div>
                  <div className="flex items-start justify-end gap-1.5 flex-wrap">
                    <Tag tone={n.sentiment === "Positive" ? "positive" : n.sentiment === "Negative" ? "negative" : "neutral"}>
                      {n.sentiment}
                    </Tag>
                    <Tag tone="accent">{n.catalyst}</Tag>
                    <Tag tone={n.impact === "High" ? "warning" : n.impact === "Low" ? "neutral" : "accent"}>{n.impact}</Tag>
                    <ChevronRight className="size-4 text-muted-foreground self-center" />
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Distribusi Sinyal">
            <div className="p-4">
              {([["Positive", sentimentCounts.Positive, "positive"], ["Neutral", sentimentCounts.Neutral, "accent"], ["Negative", sentimentCounts.Negative, "negative"]] as [string, number, Tone][]).map(([l, n, t]) => (
                <div className="mb-4" key={l}>
                  <div className="mb-2 flex justify-between text-xs">
                    <span>{l}</span>
                    <span>{n} · {news.length > 0 ? Math.round((n / news.length) * 100) : 0}%</span>
                  </div>
                  <Bar value={news.length > 0 ? Math.round((n / news.length) * 100) : 0} tone={t} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Distribusi Katalis">
            <div className="p-4">
              {catalysts.filter((c) => c !== "Semua").map((c) => {
                const count = news.filter((n) => n.catalyst === c).length;
                return (
                  <button key={c} onClick={() => setCatalyst(catalyst === c ? "Semua" : c)}
                    className={cn("mb-2 flex w-full items-center justify-between text-xs transition-colors hover:text-primary",
                      catalyst === c ? "text-primary font-medium" : "text-muted-foreground")}>
                    <span>{c}</span>
                    <span className="tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
          <Panel title="Pemetaan Dampak" kicker="Turunan">
            <div className="p-4 text-xs">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <div className="border border-border p-2">Peristiwa berita</div>
                <ChevronRight className="size-3" />
                <div className="border border-primary/30 bg-primary/5 p-2">Katalis emiten</div>
                <ChevronRight className="size-3" />
                <div className="border border-border p-2">Transmisi sektor</div>
                <ChevronRight className="size-3" />
                <div className="border border-warning/30 bg-warning/5 p-2">Potensi dampak</div>
              </div>
              <p className="mt-4 text-[10px] leading-4 text-muted-foreground">
                Memetakan relevansi peristiwa di konteks emiten dan sektor. Potensi dampak bukan prediksi harga.
              </p>
            </div>
          </Panel>
        </div>
      </div>
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle>Analisis dampak berita</SheetTitle>
            <SheetDescription>{detail?.headline}</SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-4">
                {meta("Emiten", detail.company)}
                {meta("Sektor", detail.sector)}
                {meta("Sentimen", detail.sentiment)}
                {meta("Katalis", detail.catalyst)}
                {meta("Dampak", detail.impact)}
                {meta("Sumber", detail.source)}
              </div>
              <div className="border-l-2 border-primary bg-accent/40 p-4">
                <InsightLabel>Potensi transmisi</InsightLabel>
                <p className="mt-2 text-xs leading-5">
                  Peristiwa {detail.catalyst.toLowerCase()} ini dapat memengaruhi fundamental {detail.company} terlebih dahulu,
                  dengan relevansi {detail.impact.toLowerCase()} bagi kelompok peer {detail.sector} yang lebih luas.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Tag tone={detail.sentiment === "Positive" ? "positive" : detail.sentiment === "Negative" ? "negative" : "neutral"} className="justify-center py-2 text-xs">
                  Sentimen: {detail.sentiment}
                </Tag>
                <Tag tone={detail.impact === "High" ? "warning" : detail.impact === "Low" ? "neutral" : "accent"} className="justify-center py-2 text-xs">
                  Dampak: {detail.impact}
                </Tag>
              </div>
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
    ["Pertumbuhan > 8%",    (c) => c.growth > 8],
    ["Margin > 15%",        (c) => c.margin > 15],
    ["Utang < 50%",         (c) => c.debt < 50],
    ["Dividen > 4%",        (c) => c.dividend > 4],
    ["Tidak ada anomali",   (c) => !c.anomaly],
    ["P/E < 20x",           (c) => c.pe > 0 && c.pe < 20],
  ];

  const toggleFlag = (f: string) =>
    setActiveFlags((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);

  const result = useMemo(() => {
    let list = companies.filter((c) =>
      c.shi >= minShi &&
      c.safety >= minSafety &&
      (classification === "Semua" || classify(c) === classification) &&
      activeFlags.every((f) => {
        const def = flagDefs.find(([label]) => label === f);
        return def ? def[1](c) : true;
      })
    );
    return [...list].sort((a, b) => sortDir === "desc" ? b[sortCol] - a[sortCol] : a[sortCol] - b[sortCol]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minShi, minSafety, classification, activeFlags, sortCol, sortDir]);

  function toggleSort(k: CompanyKey) {
    if (sortCol === k) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortCol(k); setSortDir("desc"); }
  }

  const SortIcon = ({ k }: { k: CompanyKey }) =>
    sortCol === k
      ? sortDir === "desc" ? <ChevronDown className="ml-1 inline size-3 text-primary" /> : <ChevronUp className="ml-1 inline size-3 text-primary" />
      : <ArrowDownUp className="ml-1 inline size-3 opacity-30" />;

  const matrices: [string, string, Tone][] = [
    ["Undervalued Quality", "P/E ≤ 14x · margin ≥ 20% · safety ≥ 75", "positive"],
    ["Growth at Reasonable Price", "Pertumbuhan ≥ 12% · P/E ≤ 22x", "accent"],
    ["Dividend Trap Alert", "Yield ≥ 7% · safety < 65", "warning"],
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Screener Keputusan">
        <span className="text-[10px] text-muted-foreground">
          {result.length} emiten cocok
        </span>
        <ExportMenu title="Decision Matrix Results" />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[310px_1fr]">
        <Panel title="Faktor Screening" kicker="Konfigurasi aturan">
          <div className="p-4">
            <Range label="SHI Minimum" value={minShi} set={setMinShi} />
            <Range label="Keamanan finansial" value={minSafety} set={setMinSafety} />
            <label className="mt-5 block text-[10px] uppercase text-muted-foreground">Klasifikasi</label>
            <select value={classification} onChange={(e) => setClassification(e.target.value)}
              className="mt-2 h-9 w-full border border-input bg-background px-2 text-xs">
              <option>Semua</option>
              <option>Undervalued Quality</option>
              <option>Growth at Reasonable Price</option>
              <option>Dividend Trap Alert</option>
              <option>Balanced Fundamentals</option>
            </select>
            <div className="mt-5">
              <div className="mb-2 text-[10px] uppercase text-muted-foreground">Filter tambahan</div>
              <div className="grid grid-cols-2 gap-2">
                {flagDefs.map(([label]) => (
                  <label key={label} className={cn("flex cursor-pointer items-center gap-2 border p-2 text-[10px] transition-colors",
                    activeFlags.includes(label) ? "border-primary/50 bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-border/80")}>
                    <input type="checkbox" className="accent-primary"
                      checked={activeFlags.includes(label)}
                      onChange={() => toggleFlag(label)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {(activeFlags.length > 0 || classification !== "Semua") && (
              <button onClick={() => { setActiveFlags([]); setClassification("Semua"); }}
                className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-negative transition-colors">
                <RefreshCw className="size-3" />Reset semua filter
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
                <button key={a} onClick={() => setClassification(classification === a ? "Semua" : a)}
                  className={cn("bg-card p-4 text-left hover:bg-secondary transition-colors",
                    classification === a && "ring-1 ring-primary/40")}>
                  <Tag tone={t}>{a}</Tag>
                  <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{b}</p>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {companies.filter((c) => classify(c) === a).length} emiten cocok
                  </div>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Hasil Screening" kicker="Dihitung dari aturan aktif"
            action={<span className="text-[10px] text-muted-foreground">{result.length} cocok</span>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <thead>
                  <tr>
                    <th className={th}>Ticker</th>
                    <th className={th}>Emiten</th>
                    <th className={th}>Sektor</th>
                    <th className={cn(th, "cursor-pointer hover:text-foreground")} onClick={() => toggleSort("shi")}>
                      SHI <SortIcon k="shi" />
                    </th>
                    <th className={cn(th, "cursor-pointer hover:text-foreground")} onClick={() => toggleSort("growth")}>
                      Pertumbuhan <SortIcon k="growth" />
                    </th>
                    <th className={cn(th, "cursor-pointer hover:text-foreground")} onClick={() => toggleSort("safety")}>
                      Keamanan <SortIcon k="safety" />
                    </th>
                    <th className={cn(th, "cursor-pointer hover:text-foreground")} onClick={() => toggleSort("pe")}>
                      P/E <SortIcon k="pe" />
                    </th>
                    <th className={cn(th, "cursor-pointer hover:text-foreground")} onClick={() => toggleSort("dividend")}>
                      Dividen <SortIcon k="dividend" />
                    </th>
                    <th className={th}>Klasifikasi</th>
                    <th className={th}>Pantau</th>
                  </tr>
                </thead>
                <tbody>
                  {result.map((c) => {
                    const cl = classify(c);
                    const tone: Tone = cl === "Dividend Trap Alert" ? "warning" : cl === "Undervalued Quality" ? "positive" : "accent";
                    return (
                      <tr key={c.ticker} className="hover:bg-secondary/50">
                        <td className={cn(td, "font-semibold text-primary")}>{c.ticker}</td>
                        <td className={td}>{c.name}</td>
                        <td className={td}>{c.sector}</td>
                        <td className={td}><Score value={c.shi} /></td>
                        <td className={td}><Change value={c.growth} /></td>
                        <td className={td}><Score value={c.safety} /></td>
                        <td className={td}>{c.pe || "NM"}x</td>
                        <td className={td}>{c.dividend}%</td>
                        <td className={td}><Tag tone={tone}>{cl}</Tag></td>
                        <td className={td}><WatchlistToggle ticker={c.ticker} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {result.length === 0 && (
                <div className="p-10 text-center text-xs text-muted-foreground">
                  Tidak ada emiten yang cocok dengan threshold saat ini. Coba turunkan nilai minimum.
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
function Range({ label, value, set }: { label: string; value: number; set: (v: number) => void }) {
  return (
    <label className="mb-5 block">
      <div className="mb-2 flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-primary font-medium">{value}</span>
      </div>
      <input className="w-full accent-primary" type="range" min="30" max="95" value={value}
        onChange={(e) => set(Number(e.target.value))} />
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>30</span><span>95</span>
      </div>
    </label>
  );
}
function WatchlistToggle({ ticker }: { ticker: string }) {
  const { has, add, remove } = useWatchlistStore();
  const inList = has(ticker);
  return (
    <button onClick={() => inList ? remove(ticker) : add(ticker)}
      className={cn("rounded p-1 transition-colors", inList ? "text-primary" : "text-muted-foreground hover:text-primary")}
      title={inList ? "Hapus dari pantauan" : "Tambah ke pantauan"}>
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

  const list = useMemo(() =>
    entries.map((e) => {
      const company = companies.find((c) => c.ticker === e.ticker);
      return { ...e, company };
    }),
    [entries]
  );

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = addTicker.trim().toUpperCase();
    if (!t) return;
    const exists = companies.find((c) => c.ticker === t);
    if (!exists) { setAddError(`Ticker "${t}" tidak ditemukan di data.`); return; }
    add(t);
    setAddTicker("");
    setAddError("");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Daftar Pantauan">
        <form onSubmit={handleAdd} className="flex gap-2">
          <div className="relative">
            <Input value={addTicker} onChange={(e) => { setAddTicker(e.target.value.toUpperCase()); setAddError(""); }}
              placeholder="Ticker (mis. BBCA)" className="h-8 w-36 text-xs uppercase" maxLength={8} />
          </div>
          <Button type="submit" size="sm" variant="outline"><Plus className="size-3.5" />Tambah</Button>
        </form>
        <ExportMenu title="Watchlist Insights" />
      </PageHeader>
      {addError && (
        <div className="flex items-center gap-2 rounded border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
          <CircleAlert className="size-4 shrink-0" />{addError}
        </div>
      )}
      {entries.length === 0 ? (
        <Panel title="Daftar Pantauan Kosong">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <StarOff className="size-12 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-foreground">Belum ada emiten dipantau</p>
              <p className="mt-1 text-xs text-muted-foreground">Tambahkan ticker di atas, atau klik ikon bintang di tabel Screener / Terminal Emiten.</p>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Ringkasan Pantauan" kicker="Kondisi dipantau">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr>
                    {["Ticker", "Emiten", "Harga", "Perubahan", "SHI", "Keamanan", "Anomali", "Ditambahkan", "Aksi"].map((x) => (
                      <th className={th} key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.ticker} className="hover:bg-secondary/50">
                      <td className={cn(td, "font-semibold text-primary")}>{e.ticker}</td>
                      <td className={td}>{e.company?.name ?? "—"}</td>
                      <td className={td}>{e.company ? formatIDR(e.company.price) : "—"}</td>
                      <td className={td}>{e.company ? <Change value={e.company.change} /> : "—"}</td>
                      <td className={td}>{e.company?.shi ?? "—"}</td>
                      <td className={td}>{e.company ? <Score value={e.company.safety} /> : "—"}</td>
                      <td className={td}>
                        {e.company?.anomaly ? <Tag tone="warning">{e.company.anomaly}</Tag> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={cn(td, "text-muted-foreground text-[10px]")}>
                        {new Date(e.addedAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditNote(e.ticker); setNoteValue(e.note); }}
                            className="rounded p-1 text-muted-foreground hover:text-primary transition-colors" title="Edit catatan">
                            <BookOpen className="size-3.5" />
                          </button>
                          <button onClick={() => remove(e.ticker)}
                            className="rounded p-1 text-muted-foreground hover:text-negative transition-colors" title="Hapus dari pantauan">
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
                    <button onClick={() => { setEditNote(e.ticker); setNoteValue(e.note); }}
                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
                      {e.note ? "Edit catatan" : "+ Tambah catatan"}
                    </button>
                  </div>
                  {e.note
                    ? <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{e.note}</p>
                    : <p className="mt-1.5 text-[10px] italic text-muted-foreground/50">Belum ada catatan.</p>
                  }
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
            <textarea ref={noteRef} value={noteValue} onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Tulis catatan riset di sini…"
              className="min-h-36 w-full resize-y rounded border border-input bg-background p-3 text-xs outline-none focus:ring-1 focus:ring-primary/30" />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => { if (editNote) { updateNote(editNote, noteValue); setEditNote(null); } }}>
                Simpan Catatan
              </Button>
              <Button variant="outline" onClick={() => setEditNote(null)}>Batal</Button>
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
              <button onClick={() => setOpen(m.id)} key={m.id}
                className={cn("flex w-full items-center justify-between border-l-2 px-3 py-3 text-left text-xs",
                  open === m.id ? "border-primary bg-accent text-accent-foreground" : "border-transparent text-muted-foreground hover:bg-secondary")}>
                <span>{m.name}</span>
                <ChevronRight className="size-3" />
              </button>
            ))}
          </div>
        </Panel>
        <div className="space-y-4">
          {methodology.filter((m) => m.id === open).map((m) => (
            <Panel key={m.id} title={m.name} kicker="Metodologi kustom">
              <div className="p-5">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Yang diukur</div>
                    <p className="mt-2 text-sm leading-6">{m.purpose}</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Interpretasi</div>
                    <p className="mt-2 text-sm leading-6">{m.interpretation}</p>
                  </div>
                </div>
                <div className="mt-6 border-t border-border pt-5">
                  <div className="text-[10px] uppercase text-muted-foreground">Indikator dan bobot</div>
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
    try { return (localStorage.getItem("theme") as "dark" | "light") || "dark"; }
    catch { return "dark"; }
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
  const apiKeyConfigured = !!(import.meta.env["VITE_API_URL"]);
  const dataMode = "PROTOTYPE";

  const cacheStats = [
    { label: "Redis", value: "Tidak tersambung", tone: "warning" as Tone, note: "Fallback in-memory aktif" },
    { label: "TanStack Query", value: "Aktif", tone: "positive" as Tone, note: "staleTime: 5 mnt · gcTime: 30 mnt" },
    { label: "Server cache", value: "Siap", tone: "positive" as Tone, note: "Menunggu koneksi Redis" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Pengaturan" />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Preferensi Workspace">
          <div className="divide-y divide-border">
            {([
              ["Pasar default", "Bursa Efek Indonesia (IDX)"],
              ["Format angka", "Locale Indonesia"],
              ["Zona waktu", "Asia/Jakarta (WIB)"],
              ["Kepadatan tampilan", "Terminal kompak"],
            ] as [string, string][]).map(([a, b]) => (
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
                <Switch checked={theme === "light"} onCheckedChange={(checked) => toggleTheme(checked ? "light" : "dark")} aria-label="Toggle light mode" />
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
              <Button variant="outline" size="sm" onClick={clear} className="text-negative hover:border-negative/40 hover:bg-negative/10">
                <Trash2 className="size-3.5" />Hapus semua
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
              Mode Prototype menggunakan data mock yang realistis. Skor kustom adalah model analitis independen dan bukan rating pasar resmi atau rekomendasi investasi.
            </p>
          </div>
          <div className="flex gap-3 border border-primary/20 bg-primary/5 p-3">
            <Layers className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">Strategi cache 6 lapis aktif:</span>
              {" "}Redis server cache · TanStack Query in-memory · Request deduplication · Morning prefetch cron · Smart invalidation · Credit budget monitor.
              Redis belum terhubung — menggunakan in-memory fallback.
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
