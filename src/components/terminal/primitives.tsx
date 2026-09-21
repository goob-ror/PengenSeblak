import type { ReactNode } from "react";
import { Info, Sparkles, Download, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/market-data";

export function Panel({
  title,
  kicker,
  action,
  children,
  className,
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel-in border border-border bg-card", className)}>
      <header className="relative flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="absolute left-0 top-0 h-0.5 w-12 bg-primary" />
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {kicker && <span className="text-[10px] uppercase text-primary/70">{kicker}</span>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function InsightLabel({ children = "Derived insight" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase text-primary">
      <Sparkles className="size-3" />
      {children}
    </span>
  );
}
export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
        tone === "positive" && "border-positive/30 bg-positive/10 text-positive",
        tone === "negative" && "border-negative/30 bg-negative/10 text-negative",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        tone === "accent" && "border-primary/30 bg-primary/10 text-primary",
        tone === "neutral" && "border-border bg-secondary text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
export function Change({ value, suffix = "%" }: { value: number; suffix?: string }) {
  return (
    <span className={cn("text-data font-medium", value >= 0 ? "text-positive" : "text-negative")}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}
      {suffix}
    </span>
  );
}
export function Score({ value, label }: { value: number; label?: string }) {
  const tone =
    value >= 80 ? "positive" : value >= 65 ? "accent" : value >= 50 ? "warning" : "negative";
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "text-lg font-semibold text-data",
          tone === "positive" && "text-positive",
          tone === "accent" && "text-primary",
          tone === "warning" && "text-warning",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </span>
      {label && <Tag tone={tone}>{label}</Tag>}
    </div>
  );
}
export function MethodTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Methodology information"
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
          >
            <Info className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
export function MetricStrip({
  items,
}: {
  items: { label: string; value: ReactNode; sub?: ReactNode }[];
}) {
  return (
    <div className="grid border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
      {items.map((x, i) => (
        <div
          key={x.label}
          className={cn(
            "relative min-h-[72px] px-4 py-3 transition-colors hover:bg-secondary/50",
            i > 0 && "border-l border-border",
          )}
        >
          <div className="absolute left-0 top-0 h-0.5 w-full bg-primary/30" />
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{x.label}</div>
          <div className="mt-1.5 text-xl font-semibold text-data text-foreground">{x.value}</div>
          {x.sub && <div className="mt-1 text-[11px] text-muted-foreground">{x.sub}</div>}
        </div>
      ))}
    </div>
  );
}
export function Bar({ value, tone = "accent" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-1.5 w-full bg-secondary">
      <div
        className={cn(
          "h-full",
          tone === "accent" && "bg-primary",
          tone === "positive" && "bg-positive",
          tone === "negative" && "bg-negative",
          tone === "warning" && "bg-warning",
        )}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}
export function ExportMenu({ title }: { title: string }) {
  const copy = () =>
    navigator.clipboard?.writeText(
      `${title}\nGenerated by Sectors Terminal\n${new Date().toLocaleString("id-ID")}`,
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={copy}>
          <Copy />
          Copy as text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer />
          Print / Save PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function PageHeader({
  title,
  eyebrow = "Indonesia Market Intelligence",
  children,
}: {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-8 w-0.5 shrink-0 bg-primary" />
        <div>
          <div className="text-[10px] uppercase tracking-widest text-primary">{eyebrow}</div>
          <h1 className="mt-0.5 text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-[10px] text-muted-foreground">
            DATA <span className="text-primary font-medium">→</span> ANALYSIS{" "}
            <span className="text-primary font-medium">→</span> INSIGHT
          </p>
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
export const th =
  "whitespace-nowrap px-3 py-2 text-left text-[10px] font-medium uppercase text-muted-foreground";
export const td = "whitespace-nowrap border-t border-border px-3 py-2 text-xs text-foreground";
