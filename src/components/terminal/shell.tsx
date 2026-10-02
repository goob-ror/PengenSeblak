import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Building2,
  Command,
  FileText,
  Filter,
  Gauge,
  LogOut,
  Menu,
  Newspaper,
  Search,
  Settings,
  Star,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFullUniverse } from "@/hooks/useCompanyTerminal";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useJakartaClock, idxSession } from "@/hooks/useJakartaClock";

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
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const clock = useJakartaClock();
  const session = idxSession(clock);

  async function handleLogout() {
    await logout();
    void navigate({ to: "/login", replace: true });
  }
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
        <div className="flex size-12 items-center justify-center text-primary">
          <img src="Nusantara Terminal Icon Transparent.png" alt="Web Icons" />
        </div>
        <div className="ml-3">
          <div className="text-sm font-semibold">Nusantara</div>
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
        <p className="mb-3 text-[9px] leading-3 text-muted-foreground/60">
          Alat analisis dan informasi pasar. Bukan rekomendasi investasi.
        </p>
        {/* User info */}
        {user && (
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
              <User className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-foreground">
                {user.fullName}
              </div>
              <div className="truncate text-[9px] text-muted-foreground">{user.email}</div>
            </div>
            <button
              id="sidebar-logout-btn"
              onClick={() => void handleLogout()}
              title="Keluar"
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
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
      <div className="min-w-0 lg:pl-60">
        <header className="sticky top-0 z-30 flex h-12 items-center border-b border-border bg-background/95 px-4 backdrop-blur">
          <Button
            className="mr-3 lg:hidden"
            size="icon"
            variant="ghost"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-[10px] uppercase">
            <span
              className={cn(
                "size-1.5 shrink-0",
                session.isOpen ? "bg-positive" : "bg-muted-foreground",
              )}
            />
            <span
              className={cn("shrink-0", session.isOpen ? "text-positive" : "text-muted-foreground")}
            >
              {session.isOpen ? "IDX" : "IDX"}
            </span>
            <span className="hidden truncate text-muted-foreground sm:inline">
              {session.label} · Jakarta {clock.timeHHMM} WIB
            </span>
          </div>
          <Button
            onClick={() => setSearch(true)}
            variant="outline"
            size="sm"
            className="ml-auto hidden w-64 shrink-0 justify-start text-muted-foreground md:flex"
          >
            <Search />
            Cari ticker, sektor, berita <kbd className="ml-auto text-[9px]">⌘K</kbd>
          </Button>
          <button
            onClick={() => setSearch(true)}
            className="ml-auto flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary md:hidden"
            aria-label="Buka pencarian"
          >
            <Search className="size-4" />
          </button>
          <div className="ml-3 hidden text-right text-[10px] sm:block">
            <div>{clock.dateISO}</div>
            <div className="text-muted-foreground tabular-nums">{clock.timeHHMMSS} WIB</div>
          </div>
        </header>
        <main className="min-w-0 p-3 sm:p-4 md:p-6">{children}</main>
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
  const navigate = useNavigate();
  // Full IDX universe (~960 tickers, 1 credit, 7d cache) — loads when opened
  const universe = useFullUniverse(open);
  // Live watchlist — so users can jump straight to their monitored tickers
  const watchlist = useWatchlistStore((s) => s.entries);
  const has = useWatchlistStore((s) => s.has);

  const ql = q.trim().toLowerCase();

  // Watchlist matches — shown FIRST (user's own monitored names)
  const watchMatches = useMemo(() => {
    if (!ql) return watchlist.slice(0, 3);
    return watchlist.filter((w) => w.ticker.toLowerCase().includes(ql)).slice(0, 3);
  }, [ql, watchlist]);

  // Emiten matches from the full universe — brief details from top50 data
  const matches = useMemo(() => {
    const list = universe.data ?? [];
    if (!ql) return list.slice(0, 5);
    return list.filter((c) => (c.ticker + " " + c.name).toLowerCase().includes(ql)).slice(0, 8);
  }, [ql, universe.data]);

  // Navigate to the DEDICATED emiten detail page (not Terminal Emiten).
  // Terminal Emiten keeps its own persistent peer selection — dumping a
  // searched ticker in there permanently polluted that list.
  function goCompany(ticker: string) {
    onOpenChange(false);
    void navigate({ to: "/emiten/$symbol", params: { symbol: ticker.toUpperCase() } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] w-[calc(100vw-2rem)] max-w-2xl translate-y-0 border-border bg-popover p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Pencarian Global</DialogTitle>
        </DialogHeader>
        <div className="flex items-center border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari emiten, ticker, atau watchlist…"
            className="h-14 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-[55vh] overflow-auto p-2">
          {universe.isPending && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Memuat daftar emiten IDX…
            </div>
          )}

          {/* Watchlist group — user's monitored tickers first */}
          {watchMatches.length > 0 && (
            <>
              <div className="px-2 py-2 text-[9px] uppercase text-muted-foreground">
                Pantauan Saya
              </div>
              {watchMatches.map((w) => {
                const meta = (universe.data ?? []).find((c) => c.ticker === w.ticker);
                return (
                  <button
                    key={w.ticker}
                    onClick={() => goCompany(w.ticker)}
                    className="flex w-full items-center gap-2 border border-transparent px-3 py-2 text-left hover:border-border hover:bg-secondary"
                  >
                    <Star className="size-3.5 shrink-0 text-primary" />
                    <span className="w-16 text-xs font-semibold text-primary">{w.ticker}</span>
                    <span className="truncate text-xs">{meta?.name ?? "—"}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {meta?.freeFloat != null
                        ? `Float ${(meta.freeFloat * 100).toFixed(0)}%`
                        : meta
                          ? "—"
                          : ""}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {/* Emiten group — full universe search */}
          {matches.length > 0 && (
            <>
              <div className="mt-2 px-2 py-2 text-[9px] uppercase text-muted-foreground">
                Emiten IDX
              </div>
              {matches.map((c) => {
                const inList = has(c.ticker);
                return (
                  <button
                    key={c.ticker}
                    onClick={() => goCompany(c.ticker)}
                    className="flex w-full items-center gap-2 border border-transparent px-3 py-2 text-left hover:border-border hover:bg-secondary"
                  >
                    <span className="w-16 shrink-0 text-xs font-semibold text-primary">
                      {c.ticker}
                    </span>
                    <span className="truncate text-xs">{c.name}</span>
                    {c.freeFloat != null && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        Float {(c.freeFloat * 100).toFixed(0)}%{inList ? " · dipantau" : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* Empty state — only after load with a query */}
          {!universe.isPending && ql && watchMatches.length === 0 && matches.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Tidak ada emiten cocok dengan “{q}”.
            </div>
          )}
          {!universe.isPending && !ql && watchMatches.length === 0 && matches.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Universe emiten belum termuat. Coba buka pencarian lagi.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <Command className="size-3" />
          Klik emiten untuk membuka detail di Terminal Emiten
        </div>
      </DialogContent>
    </Dialog>
  );
}
