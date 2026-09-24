"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
  t:     string;   // axis label ("MM-DD" or "HH:MM")
  value: number;   // IHSG level
}

export interface SectorChartPoint {
  t:      string;
  sector: number;  // indexed to 100
  ihsg:   number;
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
              <stop offset="0%"   stopColor="var(--color-primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0}    />
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
              background:  "var(--color-popover)",
              border:      "1px solid var(--color-border)",
              borderRadius: 2,
              fontSize:    11,
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
      date: p.date?.slice(5) ?? "",   // "MM-DD"
      value: Number(p.net_foreign_inflow ?? 0),
    }))
    .filter((p) => p.date);

  if (series.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-[10px] text-muted-foreground">
        Tidak ada data aliran dana asing.
      </div>
    );
  }

  const g = (v: number) =>
    `Rp. ${(v / 1e12).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} T`;

  return (
    <div className="h-32 w-full px-2 pt-3">
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
            labelStyle={{ color: "var(--color-muted-foreground)" }}
            formatter={(v: number) => [
              `${v >= 0 ? "+" : "-"}${g(Math.abs(v))}`,
              v >= 0 ? "Net masuk" : "Net keluar",
            ]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="value"
            radius={[1, 1, 0, 0]}
            // Per-cell colour: positive green, negative red
            shape={(props: any) => {
              const { x, y, width, height, payload } = props;
              const v = payload?.value ?? 0;
              return (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={Math.max(Math.abs(height), 1)}
                  fill={v >= 0 ? "var(--color-positive)" : "var(--color-negative)"}
                  opacity={0.75}
                />
              );
            }}
          />
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

export function GrowthHistoryChart({ data }: { data: GrowthChartPoint[] }) {
  const series = (data ?? []).filter((d) => d.revenue != null || d.earnings != null);

  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-[10px] text-muted-foreground">
        Data pertumbuhan historis tidak tersedia untuk sub-sektor ini.
      </div>
    );
  }

  return (
    <div className="h-64 w-full px-2 pt-3">
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
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="earnings"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
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
              background:  "var(--color-popover)",
              border:      "1px solid var(--color-border)",
              borderRadius: 2,
              fontSize:    11,
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
