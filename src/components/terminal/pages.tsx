"use client";
import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Filter,
  Info,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
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
import { cn } from "@/lib/utils";

const toneFor = (v: number): Tone => (v > 0 ? "positive" : v < 0 ? "negative" : "neutral");
const meta = (label: string, value: string) => (
  <div>
    <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    <div className="mt-1 text-xs text-foreground">{value}</div>
  </div>
);

export function MarketOverview() {
  const [period, setPeriod] = useState("1D");
  const [detail, setDetail] = useState<(typeof anomalies)[number] | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Market Overview">
        <div className="text-[10px] text-muted-foreground">Market pulse · 20 Sep 2026</div>
        <ExportMenu title="Market Overview" />
      </PageHeader>
      <MetricStrip
        items={[
          { label: "IHSG", value: "7,412.86", sub: <Change value={0.82} /> },
          { label: "Day range", value: "7,352–7,428", sub: "76 point range" },
          {
            label: "Market status",
            value: <span className="text-positive">OPEN</span>,
            sub: "Session II · 01:28 left",
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
          { label: "Turnover", value: "Rp 8.4T", sub: "0.94× 20D pace" },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[1.45fr_.85fr]">
        <Panel
          title="IHSG Intraday"
          kicker="Raw market data"
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
            <span>
              <i className="mr-1 inline-block size-1.5 bg-primary" />
              IHSG
            </span>
            <span>VWAP 7,391.20</span>
            <span className="ml-auto">Range: {period}</span>
          </div>
        </Panel>
        <Panel title="Sector Heatmap" kicker="Relative performance">
          <div className="divide-y divide-border">
            {sectors.map((s, i) => {
              const isPos = s.performance >= 0;
              const abs = Math.abs(s.performance);
              const barWidth = Math.min(100, abs * 25);
              return (
                <div
                  key={s.name}
                  className="grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors"
                  title={`Market cap: Rp ${s.cap}T`}
                >
                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                    {s.code}
                  </span>
                  <div className="min-w-0">
                    <div className="mb-1 text-xs">{s.name}</div>
                    <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isPos ? "bg-positive/60" : "bg-negative/60",
                        )}
                        style={{ width: `${Math.max(3, barWidth)}%` }}
                      />
                    </div>
                  </div>
                  <Change value={s.performance} />
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Panel
          title="Sector Health Index"
          kicker="Custom derived score"
          action={
            <MethodTip text="SHI weights normalized growth (40%), margin stability (35%), and debt condition (25%) across sector constituents." />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Rank</th>
                  <th className={th}>Sector</th>
                  <th className={th}>SHI</th>
                  <th className={th}>Growth</th>
                  <th className={th}>Margin</th>
                  <th className={th}>Debt</th>
                  <th className={th}>Trend</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sectorHealth.slice(0, 6).map((s, i) => (
                  <tr key={s.name} className="hover:bg-secondary/60">
                    <td className={td}>0{i + 1}</td>
                    <td className={cn(td, "font-medium")}>{s.name}</td>
                    <td className={td}>
                      <Score value={s.score} />
                    </td>
                    <td className={td}>{s.growth}</td>
                    <td className={td}>{s.margin}</td>
                    <td className={td}>{s.debt}</td>
                    <td className={td}>{s.trend}</td>
                    <td className={td}>
                      <Tag tone={toneFor(s.score - 64)}>{healthLabel(s.score)}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Market Anomaly Monitor"
          kicker="System detected"
          action={
            <span className="text-[10px] text-muted-foreground">{anomalies.length} active</span>
          }
        >
          <div>
            {anomalies.map((a) => (
              <button
                key={a.company + a.metric}
                onClick={() => setDetail(a)}
                className="grid w-full grid-cols-[48px_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-secondary/60"
              >
                <div className="text-xs font-semibold text-primary">{a.company}</div>
                <div className="min-w-0">
                  <div className="truncate text-xs">{a.insight}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {a.metric} {a.value} · peer {a.average}
                  </div>
                </div>
                <div className="text-right">
                  <Change value={a.deviation} />
                  <div className="mt-1">
                    <Tag tone={a.severity === "High" ? "negative" : "warning"}>{a.severity}</Tag>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-3">
            <InsightLabel>Deviation-based analysis</InsightLabel>
          </div>
        </Panel>
      </div>
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle>{detail?.company} anomaly</SheetTitle>
            <SheetDescription>{detail?.insight}</SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="grid grid-cols-2 gap-5 p-5">
              {meta("Metric", detail.metric)}
              {meta("Severity", detail.severity)}
              {meta("Company", detail.value)}
              {meta("Sector baseline", detail.average)}
              {meta("Deviation", `+${detail.deviation}%`)}
              {meta("Interpretation", "Requires peer-context review")}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SectorIntelligence() {
  const [sector, setSector] = useState("Financials");
  const selected = sectorHealth.find((s) => s.name === sector);
  const universe = companies.filter((c) => c.sector === sector);
  if (!selected) return null;
  return (
    <div className="space-y-4">
      <PageHeader title="Sector Intelligence">
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="h-8 border border-input bg-background px-3 text-xs"
        >
          {sectors.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </select>
        <Button variant="outline" size="sm">
          1M <ChevronDown />
        </Button>
        <ExportMenu title={`${sector} Sector Research`} />
      </PageHeader>
      <MetricStrip
        items={[
          { label: "Selected sector", value: sector, sub: selected.code },
          {
            label: "Performance",
            value: <Change value={selected.performance} />,
            sub: "vs IHSG +0.82%",
          },
          { label: "Sector health", value: selected.score, sub: healthLabel(selected.score) },
          { label: "Trend", value: selected.trend, sub: "20D composite" },
          { label: "Companies", value: universe.length || 12, sub: "IDX listed universe" },
          { label: "Market cap", value: `Rp ${selected.cap}T`, sub: "Aggregate float-adjusted" },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <Panel title={`${sector} vs IHSG`} kicker="Indexed performance">
          <SectorChart />
          <div className="flex gap-5 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span>
              <i className="mr-1 inline-block size-1.5 bg-primary" />
              {sector}
            </span>
            <span>
              <i className="mr-1 inline-block size-1.5 bg-muted-foreground" />
              IHSG
            </span>
          </div>
        </Panel>
        <Panel
          title="Sector Health Breakdown"
          kicker="Calculated"
          action={
            <MethodTip text="Component scores are winsorized, normalized to 0–100, then weighted: growth 40%, margin stability 35%, debt condition 25%." />
          }
        >
          <div className="p-5">
            <div className="flex items-end justify-between border-b border-border pb-4">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Composite SHI</div>
                <div className="mt-1 text-5xl font-semibold text-primary">{selected.score}</div>
              </div>
              <Tag tone="positive">{healthLabel(selected.score)}</Tag>
            </div>
            {[
              ["Growth", selected.growth, 40],
              ["Margin stability", selected.margin, 35],
              ["Debt condition", selected.debt, 25],
            ].map(([l, v, w]) => (
              <div className="mt-4" key={String(l)}>
                <div className="mb-2 flex justify-between text-xs">
                  <span>{l}</span>
                  <span className="text-muted-foreground">
                    {v} · {w}% weight
                  </span>
                </div>
                <Bar value={Number(v)} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Company Universe" kicker="Raw + calculated">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr>
                {[
                  "Ticker",
                  "Company",
                  "Price",
                  "Change",
                  "Market cap",
                  "Growth",
                  "Margin",
                  "Debt",
                  "P/E",
                  "Health",
                  "Anomaly",
                ].map((x) => (
                  <th className={th} key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(universe.length ? universe : companies.slice(0, 6)).map((c) => (
                <tr key={c.ticker} className="hover:bg-secondary/50">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Sector Divergence" kicker="Generated insight">
        <div className="grid gap-px bg-border md:grid-cols-2">
          {anomalies.slice(0, 4).map((a) => (
            <div className="bg-card p-4" key={a.company}>
              <div className="flex justify-between">
                <span className="text-xs font-semibold text-primary">
                  {a.company} · {a.metric}
                </span>
                <Tag tone={a.severity === "High" ? "negative" : "warning"}>{a.severity}</Tag>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {meta("Company", a.value)}
                {meta("Sector avg", a.average)}
                {meta("Deviation", `+${a.deviation}%`)}
              </div>
              <div className="mt-4 border-l-2 border-primary pl-3 text-xs">{a.insight}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function CompanyTerminal() {
  const [selected, setSelected] = useState(["BBCA", "BBRI", "BMRI"]);
  const peers = companies.filter((c) => selected.includes(c.ticker));
  const toggle = (t: string) =>
    setSelected((p) =>
      p.includes(t) ? (p.length > 2 ? p.filter((x) => x !== t) : p) : p.length < 5 ? [...p, t] : p,
    );
  const rows: [string, (c: Company) => string][] = [
    ["Revenue growth", (c) => `${c.growth}%`],
    ["Profit margin", (c) => `${c.margin}%`],
    ["ROE", (c) => `${c.roe}%`],
    ["Debt ratio", (c) => `${c.debt}%`],
    ["P/E valuation", (c) => (c.pe ? `${c.pe}x` : "NM")],
    ["Dividend yield", (c) => `${c.dividend}%`],
    ["Market performance", (c) => `${c.change}%`],
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Company Terminal">
        <ExportMenu title="Peer Comparison" />
      </PageHeader>
      <Panel title="Peer Selection" kicker="2–5 companies">
        <div className="flex flex-wrap gap-2 p-4">
          {companies.slice(0, 8).map((c) => (
            <Button
              key={c.ticker}
              size="sm"
              variant={selected.includes(c.ticker) ? "secondary" : "outline"}
              onClick={() => toggle(c.ticker)}
              className={selected.includes(c.ticker) ? "border-primary/40 text-primary" : ""}
            >
              {selected.includes(c.ticker) ? <X /> : <Plus />}
              {c.ticker}
            </Button>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 2xl:grid-cols-[1.2fr_.8fr]">
        <Panel title="Peer Comparison Matrix" kicker="Comparable fundamentals">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr>
                  <th className={th}>Indicator</th>
                  {peers.map((c) => (
                    <th className={th} key={c.ticker}>
                      <div className="text-primary">{c.ticker}</div>
                      <div className="mt-1 normal-case text-muted-foreground">{c.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, get]) => (
                  <tr key={label}>
                    <td className={cn(td, "text-muted-foreground")}>{label}</td>
                    {peers.map((c, i) => (
                      <td
                        className={cn(td, "text-base font-medium", i === 0 && "bg-accent/40")}
                        key={c.ticker}
                      >
                        {get(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Dominance Score"
          kicker="Custom weighted comparison"
          action={
            <MethodTip text="A custom weighted comparison across selected growth, profitability, ROE, debt, valuation, and market indicators. Not a buy/sell recommendation." />
          }
        >
          <div className="p-4">
            {[...peers]
              .sort((a, b) => dominanceScore(b) - dominanceScore(a))
              .map((c, i) => (
                <div key={c.ticker} className="border-b border-border py-4 first:pt-1">
                  <div className="mb-2 flex items-center">
                    <span className="w-8 text-xs text-muted-foreground">0{i + 1}</span>
                    <span className="w-16 text-sm font-semibold">{c.ticker}</span>
                    <div className="flex-1">
                      <Bar value={dominanceScore(c)} tone={i === 0 ? "positive" : "accent"} />
                    </div>
                    <span className="ml-4 text-xl font-semibold text-data">
                      {dominanceScore(c)}
                    </span>
                  </div>
                  <div className="ml-24 flex gap-3 text-[9px] text-muted-foreground">
                    <span>Growth 20%</span>
                    <span>Profit 25%</span>
                    <span>ROE 15%</span>
                    <span>Risk 15%</span>
                  </div>
                </div>
              ))}
            <div className="mt-4">
              <InsightLabel>Relative to selected peer set</InsightLabel>
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="Financial Safety & Distress"
        kicker="Derived risk analysis"
        action={
          <Button variant="ghost" size="sm">
            <Info />
            How is this calculated?
          </Button>
        }
      >
        <div className="grid gap-px bg-border md:grid-cols-3">
          {peers.map((c) => (
            <div className="bg-card p-5" key={c.ticker}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{c.ticker}</span>
                <ShieldCheck
                  className={cn("size-4", c.safety >= 80 ? "text-positive" : "text-warning")}
                />
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Safety score</div>
                  <div className="text-4xl font-semibold">{c.safety}</div>
                </div>
                <Tag tone={c.safety >= 80 ? "positive" : "warning"}>
                  {c.safety >= 80 ? "Resilient" : "Stable"}
                </Tag>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                {meta("Leverage", `${c.debt}%`)}
                {meta("Liquidity", `${c.liquidity}/100`)}
                {meta("Profitability", `${c.margin}%`)}
                {meta("Stability", `${Math.round((c.safety + c.liquidity) / 2)}/100`)}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function NewsIntelligence() {
  const [sentiment, setSentiment] = useState("All");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<(typeof news)[number] | null>(null);
  const filtered = news.filter(
    (n) =>
      (sentiment === "All" || n.sentiment === sentiment) &&
      (!query || (n.headline + n.company + n.sector).toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <div className="space-y-4">
      <PageHeader title="News Intelligence">
        <ExportMenu title="News Catalyst Analysis" />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Panel
            title="News Feed"
            kicker="Catalyst classified"
            action={
              <span className="text-[10px] text-muted-foreground">{filtered.length} signals</span>
            }
          >
            <div className="flex flex-wrap gap-2 border-b border-border p-3">
              <div className="relative min-w-52 flex-1">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Company, sector, or headline"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              {["All", "Positive", "Neutral", "Negative"].map((x) => (
                <Button
                  key={x}
                  size="sm"
                  variant={sentiment === x ? "secondary" : "outline"}
                  onClick={() => setSentiment(x)}
                >
                  {x}
                </Button>
              ))}
            </div>
            <div>
              {filtered.map((n) => (
                <button
                  key={n.headline}
                  onClick={() => setDetail(n)}
                  className="grid w-full gap-3 border-b border-border px-4 py-4 text-left hover:bg-secondary/50 md:grid-cols-[45px_1fr_250px]"
                >
                  <span className="text-xs text-muted-foreground">{n.time}</span>
                  <div>
                    <div className="text-sm leading-5">{n.headline}</div>
                    <div className="mt-2 flex gap-2">
                      <span className="text-[10px] font-semibold text-primary">{n.company}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {n.sector} · {n.source}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start justify-end gap-2">
                    <Tag
                      tone={
                        n.sentiment === "Positive"
                          ? "positive"
                          : n.sentiment === "Negative"
                            ? "negative"
                            : "neutral"
                      }
                    >
                      {n.sentiment}
                    </Tag>
                    <Tag tone="accent">{n.catalyst}</Tag>
                    <Tag tone={n.impact === "High" ? "warning" : "neutral"}>{n.impact}</Tag>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Signal Distribution">
            <div className="p-4">
              {[
                ["Positive", 3, 50, "positive"],
                ["Neutral", 2, 33, "accent"],
                ["Negative", 1, 17, "negative"],
              ].map(([l, n, v, t]) => (
                <div className="mb-4" key={String(l)}>
                  <div className="mb-2 flex justify-between text-xs">
                    <span>{l}</span>
                    <span>
                      {n} · {v}%
                    </span>
                  </div>
                  <Bar value={Number(v)} tone={t as Tone} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Impact Mapping" kicker="Derived">
            <div className="p-4 text-xs">
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <div className="border border-border p-2">News event</div>
                <ChevronRight className="size-3" />
                <div className="border border-primary/30 bg-primary/5 p-2">Company catalyst</div>
                <ChevronRight className="size-3" />
                <div className="border border-border p-2">Sector transmission</div>
                <ChevronRight className="size-3" />
                <div className="border border-warning/30 bg-warning/5 p-2">Potential impact</div>
              </div>
              <p className="mt-4 text-[10px] leading-4 text-muted-foreground">
                Maps event relevance across company and sector context. Potential impact is not a
                price forecast.
              </p>
            </div>
          </Panel>
        </div>
      </div>
      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle>News impact analysis</SheetTitle>
            <SheetDescription>{detail?.headline}</SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-4">
                {meta("Company", detail.company)}
                {meta("Sector", detail.sector)}
                {meta("Sentiment", detail.sentiment)}
                {meta("Catalyst", detail.catalyst)}
                {meta("Impact", detail.impact)}
                {meta("Source", detail.source)}
              </div>
              <div className="border-l-2 border-primary bg-accent/40 p-4">
                <InsightLabel>Potential transmission</InsightLabel>
                <p className="mt-2 text-xs leading-5">
                  This {detail.catalyst.toLowerCase()} event may affect {detail.company}{" "}
                  fundamentals first, with {detail.impact.toLowerCase()} relevance for the wider{" "}
                  {detail.sector} peer group.
                </p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function DecisionScreener() {
  const [minShi, setMinShi] = useState(60);
  const [minSafety, setMinSafety] = useState(60);
  const [classification, setClassification] = useState("All");
  const result = companies.filter(
    (c) =>
      c.shi >= minShi &&
      c.safety >= minSafety &&
      (classification === "All" || classify(c) === classification),
  );
  const matrices: [string, string, Tone][] = [
    ["Undervalued Quality", "P/E ≤ 14x · margin ≥ 20% · safety ≥ 75", "positive"],
    ["Growth at Reasonable Price", "Growth ≥ 12% · P/E ≤ 22x", "accent"],
    ["Dividend Trap Alert", "Yield ≥ 7% · safety < 65", "warning"],
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Decision Screener">
        <ExportMenu title="Decision Matrix Results" />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[310px_1fr]">
        <Panel title="Screening Factors" kicker="Rule configuration">
          <div className="p-4">
            <Range label="Minimum SHI" value={minShi} set={setMinShi} />
            <Range label="Financial safety" value={minSafety} set={setMinSafety} />
            <label className="mt-5 block text-[10px] uppercase text-muted-foreground">
              Classification
            </label>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              className="mt-2 h-9 w-full border border-input bg-background px-2 text-xs"
            >
              <option>All</option>
              <option>Undervalued Quality</option>
              <option>Growth at Reasonable Price</option>
              <option>Dividend Trap Alert</option>
              <option>Balanced Fundamentals</option>
            </select>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[
                "Growth > 8%",
                "Margin > 15%",
                "Debt < 50%",
                "Dividend > 4%",
                "No anomaly",
                "P/E < 20x",
              ].map((x) => (
                <label
                  className="flex items-center gap-2 border border-border p-2 text-[10px]"
                  key={x}
                >
                  <input type="checkbox" className="accent-primary" />
                  {x}
                </label>
              ))}
            </div>
            <Button className="mt-5 w-full" size="sm">
              <Filter />
              Apply decision matrix
            </Button>
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
              Deterministic analytical classifications. No trade instruction is generated.
            </p>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Multi-Factor Decision Matrix" kicker="Explainable classification">
            <div className="grid gap-px bg-border md:grid-cols-3">
              {matrices.map(([a, b, t]) => (
                <button
                  key={a}
                  onClick={() => setClassification(a)}
                  className="bg-card p-4 text-left hover:bg-secondary"
                >
                  <Tag tone={t}>{a}</Tag>
                  <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{b}</p>
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            title="Screening Results"
            kicker="Calculated from active rules"
            action={
              <span className="text-[10px] text-muted-foreground">{result.length} matches</span>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <thead>
                  <tr>
                    {[
                      "Ticker",
                      "Company",
                      "Sector",
                      "SHI",
                      "Growth",
                      "Safety",
                      "P/E",
                      "Dividend",
                      "Classification",
                    ].map((x) => (
                      <th className={th} key={x}>
                        {x}
                        {x === "Safety" && <ArrowDownUp className="ml-1 inline size-3" />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.map((c) => (
                    <tr className="hover:bg-secondary/50" key={c.ticker}>
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
                        <Tag tone={classify(c).includes("Trap") ? "warning" : "accent"}>
                          {classify(c)}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!result.length && (
                <div className="p-10 text-center text-xs text-muted-foreground">
                  No companies match the current thresholds.
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
        <span className="text-primary">{value}</span>
      </div>
      <input
        className="w-full accent-primary"
        type="range"
        min="30"
        max="95"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
    </label>
  );
}

export function Methodology() {
  const [open, setOpen] = useState("shi");
  return (
    <div className="space-y-4">
      <PageHeader title="Methodology" eyebrow="Explainable intelligence">
        <ExportMenu title="Sectors Terminal Methodology" />
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Panel title="Analytical Models">
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
              <Panel key={m.id} title={m.name} kicker="Custom methodology">
                <div className="p-5">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        What is measured
                      </div>
                      <p className="mt-2 text-sm leading-6">{m.purpose}</p>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        Interpretation
                      </div>
                      <p className="mt-2 text-sm leading-6">{m.interpretation}</p>
                    </div>
                  </div>
                  <div className="mt-6 border-t border-border pt-5">
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Indicators and weights
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
                    <InsightLabel>Normalization and calculation</InsightLabel>
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

export function Watchlist() {
  const list = companies.slice(0, 6);
  return (
    <div className="space-y-4">
      <PageHeader title="Watchlist">
        <Button size="sm">
          <Plus />
          Add instrument
        </Button>
        <ExportMenu title="Watchlist Insights" />
      </PageHeader>
      <Panel title="Research Watchlist" kicker="Monitored conditions">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                {[
                  "Ticker",
                  "Company",
                  "Price",
                  "Change",
                  "SHI",
                  "Safety",
                  "Anomaly",
                  "Research note",
                ].map((x) => (
                  <th className={th} key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.ticker}>
                  <td className={cn(td, "font-semibold text-primary")}>{c.ticker}</td>
                  <td className={td}>{c.name}</td>
                  <td className={td}>{formatIDR(c.price)}</td>
                  <td className={td}>
                    <Change value={c.change} />
                  </td>
                  <td className={td}>{c.shi}</td>
                  <td className={td}>{c.safety}</td>
                  <td className={td}>{c.anomaly ? <Tag tone="warning">{c.anomaly}</Tag> : "—"}</td>
                  <td className={cn(td, "text-muted-foreground")}>
                    {c.safety > 80 ? "Track resilience" : "Review next filing"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
export function SettingsPage() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return (localStorage.getItem("theme") as "dark" | "light") || "dark";
    } catch {
      return "dark";
    }
  });

  const toggleTheme = (value: "dark" | "light") => {
    setTheme(value);
    localStorage.setItem("theme", value);
    const html = document.documentElement;
    if (value === "light") {
      html.classList.remove("dark");
      html.classList.add("light");
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <Panel title="Workspace Preferences">
        <div className="divide-y divide-border">
          {[
            ["Default market", "Indonesia Stock Exchange"],
            ["Number format", "Indonesian locale"],
            ["Time zone", "Asia/Jakarta (WIB)"],
            ["Density", "Compact terminal"],
          ].map(([a, b]) => (
            <div className="flex items-center justify-between px-4 py-3" key={a}>
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
              <span className="text-[10px] text-muted-foreground">Dark</span>
              <Switch
                checked={theme === "light"}
                onCheckedChange={(checked) => toggleTheme(checked ? "light" : "dark")}
                aria-label="Toggle light mode"
              />
              <span className="text-[10px] text-muted-foreground">Light</span>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="flex gap-3 border border-warning/30 bg-warning/5 p-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-xs leading-5 text-muted-foreground">
                Prototype mode uses realistic mock data. Custom scores are independent analytical
                models and are not official market ratings or investment recommendations.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <div className="text-xs">Live Sectors data</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Adapter ready · connection not configured
                </div>
              </div>
              <Tag tone="warning">OFFLINE</Tag>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
