"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ihsgSeries, sectorSeries } from "@/lib/market-data";
export function IHSGChart() {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={ihsgSeries} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
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
          />
          <YAxis
            domain={[7240, 7440]}
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 2,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--color-muted-foreground)" }}
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
export function SectorChart() {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sectorSeries} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            stroke="var(--color-muted-foreground)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[98, 108]}
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
