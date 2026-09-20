import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Building2,
  Command,
  FileText,
  Filter,
  Gauge,
  Menu,
  Newspaper,
  Search,
  Settings,
  Star,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { companies, news, sectors } from "@/lib/market-data";
import { cn } from "@/lib/utils";

const main = [
  { to: "/", label: "Ringkasan Pasar", icon: Gauge },
  { to: "/sectors", label: "Intelijen Sektor", icon: BarChart3 },
  { to: "/companies", label: "Terminal Emiten", icon: Building2 },
  { to: "/news", label: "Berita & Katalis", icon: Newspaper },
  { to: "/screener", label: "Screener Keputusan", icon: Filter },
] as const;
const secondary = [
  { to: "/watchlist", label: "Pantauan", icon: Star },
  { to: "/methodology", label: "Metodologi", icon: FileText },
  { to: "/settings", label: "Pengaturan", icon: Settings },
] as const;
export function TerminalShell({ children }: { children: React.ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    addEventListener("keydown", fn);
    return () => removeEventListener("keydown", fn);
  }, []);
  const nav = (
    <>
      <div className="flex h-16 items-center border-b border-border px-4">
        <div className="flex size-8 items-center justify-center border border-primary/40 bg-primary/10 text-primary">
          <Activity className="size-4" />
        </div>
        <div className="ml-3">
          <div className="text-sm font-semibold">SECTORS</div>
          <div className="text-[10px] uppercase text-muted-foreground">Terminal / ID</div>
        </div>
      </div>
      <div className="px-2 py-4">
        <div className="mb-2 px-2 text-[9px] uppercase text-muted-foreground">Intelligence</div>
        {main.map((x) => (
          <Link
            key={x.to}
            to={x.to}
            onClick={() => setMobile(false)}
            className={cn(
              "mb-0.5 flex h-9 items-center gap-3 border-l-2 border-transparent px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              path === x.to && "border-primary bg-accent text-accent-foreground",
            )}
          >
            <x.icon className="size-4" />
            {x.label}
          </Link>
        ))}
        <div className="mb-2 mt-6 px-2 text-[9px] uppercase text-muted-foreground">Workspace</div>
        <button
          onClick={() => setSearch(true)}
          className="mb-0.5 flex h-9 w-full items-center gap-3 border-l-2 border-transparent px-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Search className="size-4" />
          Search <kbd className="ml-auto border border-border px-1 text-[9px]">⌘K</kbd>
        </button>
        {secondary.map((x) => (
          <Link
            key={x.to}
            to={x.to}
            onClick={() => setMobile(false)}
            className={cn(
              "mb-0.5 flex h-9 items-center gap-3 border-l-2 border-transparent px-3 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground",
              path === x.to && "border-primary bg-accent text-accent-foreground",
            )}
          >
            <x.icon className="size-4" />
            {x.label}
          </Link>
        ))}
      </div>
      <div className="mt-auto border-t border-border p-4">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Data mode</span>
          <span className="text-warning">PROTOTYPE</span>
        </div>
        <div className="mt-2 text-[10px] leading-4 text-muted-foreground">
          Scores are custom research models, not official ratings.
        </div>
      </div>
    </>
  );
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-terminal lg:flex">
        {nav}
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-50 bg-terminal/90 lg:hidden">
          <aside className="flex h-full w-72 flex-col border-r border-border bg-terminal">
            {nav}
          </aside>
          <Button
            className="absolute right-4 top-4"
            size="icon"
            variant="outline"
            onClick={() => setMobile(false)}
          >
            <X />
          </Button>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-12 items-center border-b border-border bg-background/95 px-4 backdrop-blur">
          <Button
            className="mr-3 lg:hidden"
            size="icon"
            variant="ghost"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </Button>
          <div className="flex items-center gap-2 text-[10px] uppercase">
            <span className="size-1.5 bg-positive" />
            <span className="text-positive">IDX Open</span>
            <span className="hidden text-muted-foreground sm:inline">
              Session II · Jakarta 14:32 WIB
            </span>
          </div>
          <Button
            onClick={() => setSearch(true)}
            variant="outline"
            size="sm"
            className="ml-auto hidden w-64 justify-start text-muted-foreground md:flex"
          >
            <Search />
            Cari ticker, sektor, berita <kbd className="ml-auto text-[9px]">⌘K</kbd>
          </Button>
          <div className="ml-3 hidden text-right text-[10px] sm:block">
            <div>20 SEP 2026</div>
            <div className="text-muted-foreground">Updated 14:31:42</div>
          </div>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
      <SearchDialog open={search} onOpenChange={setSearch} />
    </div>
  );
}
function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const matches = q
    ? companies
        .filter((c) => (c.ticker + c.name + c.sector).toLowerCase().includes(q.toLowerCase()))
        .slice(0, 4)
    : companies.slice(0, 3);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] max-w-2xl translate-y-0 border-border bg-popover p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Pencarian Global</DialogTitle>
        </DialogHeader>
        <div className="flex items-center border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari emiten, ticker, sektor, atau berita…"
            className="h-14 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-[55vh] overflow-auto p-2">
          <div className="px-2 py-2 text-[9px] uppercase text-muted-foreground">Emiten</div>
          {matches.map((c) => (
            <Link
              key={c.ticker}
              to="/companies"
              onClick={() => onOpenChange(false)}
              className="flex items-center border border-transparent px-3 py-2 hover:border-border hover:bg-secondary"
            >
              <span className="w-16 text-xs font-semibold text-primary">{c.ticker}</span>
              <span className="text-xs">{c.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {c.sector} · Safety {c.safety}
              </span>
            </Link>
          ))}
          <div className="mt-2 px-2 py-2 text-[9px] uppercase text-muted-foreground">
            Hasil lintas-terminal
          </div>
          {sectors
            .filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()))
            .slice(0, 2)
            .map((s) => (
              <Link
                key={s.name}
                to="/sectors"
                onClick={() => onOpenChange(false)}
                className="flex px-3 py-2 text-xs hover:bg-secondary"
              >
                <span className="text-muted-foreground">Sektor</span>
                <span className="ml-4">{s.name}</span>
                <span className="ml-auto text-primary">
                  SHI {Math.round(s.growth * 0.4 + s.margin * 0.35 + s.debt * 0.25)}
                </span>
              </Link>
            ))}
          {news
            .filter((n) => !q || (n.headline + n.company).toLowerCase().includes(q.toLowerCase()))
            .slice(0, 2)
            .map((n) => (
              <Link
                key={n.headline}
                to="/news"
                onClick={() => onOpenChange(false)}
                className="flex gap-4 px-3 py-2 text-xs hover:bg-secondary"
              >
                <span className="text-muted-foreground">{n.time}</span>
                <span>{n.headline}</span>
              </Link>
            ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <Command className="size-3" />
          Type a symbol for a consolidated intelligence view
        </div>
      </DialogContent>
    </Dialog>
  );
}
