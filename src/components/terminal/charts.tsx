"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ihsgSeries, sectorSeries } from "@/lib/market-data";

// ── Shared types ──────────────────────────────────────────────────────────────
export interface IHSGChartPoint {
  t: string; // axis label ("MM-DD" or "HH:MM")
  value: number; // IHSG level
}

export interface SectorChartPoint {
  t: string;
  sector: number; // indexed to 100
  ihsg: number;
}

// ── IHSGChart ─────────────────────────────────────────────────────────────────
/**
 * @param data  Live series from useIHSGSeries(). Falls back to mock if omitted.
 */
export function IHSGChart({ data }: { data?: IHSGChartPoint[] }) {
  const series = data ?? ihsgSeries;

  // Derive a sensible Y-axis domain from actual data
  const values = series.map((p) => p.value);
  const minVal = Math.floor(Math.min(...values) * 0.998);
  const maxVal = Math.ceil(Math.max(...values) * 1.002);

  // Show at most 8 axis ticks regardless of series length
  const tickInterval = Math.max(1, Math.floor(series.length / 8));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ihsgFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
          />
          <YAxis
            domain={[minVal, maxVal]}
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => v.toLocaleString("id-ID")}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--color-muted-foreground)" }}
            formatter={(v: number) => [v.toLocaleString("id-ID"), "IHSG"]}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="value"
            stroke="var(--color-primary)"
            fill="url(#ihsgFill)"
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── ForeignFlowChart ───────────────────────────────────────────────────────
/**
 * Net foreign flow per session as signed bars.
 * Green = net inflow (buy), red = net outflow (sell). Zero line drawn for
 * reference so direction is readable at a glance.
 *
 * NO mock fallback — the panel already gates on isPending/isError, so this
 * only ever renders real rows. Empty array = empty chart, never fake data.
 */
export interface ForeignFlowChartPoint {
  date: string;
  net_foreign_inflow: number | null;
}

export function ForeignFlowChart({ data }: { data: ForeignFlowChartPoint[] }) {
  const series = (data ?? [])
    .map((p) => ({
      date: p.date?.slice(5) ?? "", // "MM-DD"
      value: Number(p.net_foreign_inflow ?? 0),
    }))
    .filter((p) => p.date);

  if (series.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-[10px] text-muted-foreground">
        Tidak ada data aliran dana asing.
      </div>
    );
  }

  const g = (v: number) =>
    `Rp. ${(v / 1e12).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} T`;

  // Recharts emits `fill` as an SVG *attribute*, which does NOT resolve
  // var(--…) in most browsers — it silently paints black. Use literal theme
  // values here so inflow/outflow colours actually render.
  const POS = "oklch(0.72 0.13 150)";
  const NEG = "oklch(0.68 0.16 25)";

  return (
    <div className="h-48 w-full px-2 pt-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          {/* Both axes grid + the zero baseline give the "grid" look requested */}
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
          <XAxis
            dataKey="date"
            stroke="var(--color-muted-foreground)"
            fontSize={8}
            tickLine={false}
            axisLine={false}
            interval={Math.max(1, Math.floor(series.length / 10))}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={8}
            tickLine={false}
            axisLine={false}
            width={42}
            tickFormatter={(v: number) => (v / 1e12).toFixed(1) + "T"}
          />
          <Tooltip
            cursor={{ fill: "var(--color-secondary)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--color-muted-foreground)", marginBottom: 2 }}
            itemStyle={{ padding: 0 }}
            formatter={(v: number) => {
              const inflow = v >= 0;
              const color = inflow ? POS : NEG;
              return [
                `${inflow ? "+" : "-"}${g(Math.abs(v))}`,
                inflow ? "Net Masuk" : "Net Keluar",
              ] as unknown as string;
            }}
            content={(props: any) => {
              const p = props.payload?.[0];
              if (!p) return null;
              const v = Number(p.value ?? 0);
              const inflow = v >= 0;
              const color = inflow ? POS : NEG;
              return (
                <div
                  style={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 2,
                    fontSize: 11,
                    padding: "6px 8px",
                  }}
                >
                  <div style={{ color: "var(--color-muted-foreground)", fontSize: 10 }}>
                    {props.label}
                  </div>
                  <div style={{ marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 6, height: 6, background: color, borderRadius: 1 }} />
                    <span style={{ color: "var(--color-muted-foreground)" }}>
                      {inflow ? "Net Masuk" : "Net Keluar"}
                    </span>
                    <span style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {inflow ? "+" : "-"}
                      {g(Math.abs(v))}
                    </span>
                  </div>
                </div>
              );
            }}
          />
          {/*
            Bar height MUST be drawn by recharts, not by a custom `shape`.
            A manual <rect> using Math.abs(height) draws downward from the zero
            line for negative values — measured overflow was bottom=219.8 with
            the x-axis at y=170, i.e. straight through the date labels.
            <Cell> keeps recharts in charge of geometry (negative bars extend
            upward from zero) while giving per-bar colour.
          */}
          <Bar isAnimationActive={false} dataKey="value" radius={[1, 1, 0, 0]}>
            {series.map((p, i) => (
              <Cell
                key={`${p.date}-${i}`}
                style={{ fill: p.value >= 0 ? POS : NEG, opacity: 0.85 }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── GrowthHistoryChart ─────────────────────────────────────────────────────
/**
 * Yearly revenue & earnings growth from a subsector report's
 * growth.weighted_avg_growth_data map — already fetched for the SHI, so this
 * adds ZERO extra credits. Accepts the year-keyed record directly.
 *
 * No mock fallback: an empty/absent map renders "tidak ada data".
 */
export interface GrowthChartPoint {
  year: string;
  revenue: number | null;
  earnings: number | null;
}

export function GrowthHistoryChart({
  data,
  years,
}: {
  data: GrowthChartPoint[];
  /** Show only the last N years (undefined = all). */
  years?: number;
}) {
  const all = (data ?? []).filter((d) => d.revenue != null || d.earnings != null);
  const series = years && years > 0 ? all.slice(-years) : all;

  if (series.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-[10px] text-muted-foreground">
        Data pertumbuhan historis tidak tersedia untuk sub-sektor ini.
      </div>
    );
  }

  // Literal colors: earnings previously used var(--color-accent) — a dark
  // BACKGROUND teal, invisible on the dark chart. Revenue keeps its working
  // primary color; earnings gets a bright amber. Literals because var() does
  // not resolve in SVG attributes (see ForeignFlowChart).
  const REV = "oklch(0.72 0.095 185)"; // --primary (teal)
  const EARN = "oklch(0.75 0.12 75)"; // --warning (amber)

  return (
    <div className="h-80 w-full px-2 pt-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
          <XAxis
            dataKey="year"
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(series.length / 8))}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--color-muted-foreground)" }}
            formatter={(v: number, name: string) => [
              `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
              name === "revenue" ? "Pertumbuhan Pendapatan" : "Pertumbuhan Laba",
            ]}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="revenue"
            stroke={REV}
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="earnings"
            stroke={EARN}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── SectorChart ───────────────────────────────────────────────────────────────
/**
 * @param data  Optional live series. Falls back to mock if omitted.
 */
export function SectorChart({ data }: { data?: SectorChartPoint[] }) {
  const series = data ?? sectorSeries;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            interval={Math.max(1, Math.floor(series.length / 8))}
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              fontSize: 11,
            }}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="sector"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="ihsg"
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
