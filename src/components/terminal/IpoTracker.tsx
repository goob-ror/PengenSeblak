/**
 * IpoTracker — IPO Alpha Tracker
 * ================================
 * Features To Be Implemented.md §F: IPO Alpha Tracker (Algoritma 6).
 * Renders as a Panel below the news grid on the Berita & Katalis page.
 *
 * DATA ARCHITECTURE (credit-aware)
 * --------------------------------
 * The IPO cohort list comes from /v2/companies/ — ONE eager call (1 credit /
 * page) that returns every recent listing. This is the only eager fetch.
 *
 * Per-symbol performance comes from /v2/listing-performance/{symbol}/ which
 * costs 1 credit PER symbol. Fanning that out across a 30-name cohort would
 * cost 30 credits on every page load, so it is STRICTLY lazy: the hook stays
 * disabled until the user clicks a row, and the result renders in a Sheet.
 * `useListingPerformance` is mounted with `enabled: !!selected` so React
 * Query fires exactly one request for exactly the clicked symbol, and its
 * STALE_FUNDAMENTAL cache makes re-clicking the same row free.
 *
 * Because the list therefore carries NO performance numbers, cohort-wide
 * insights are derived from fields already present in the list (listing_date,
 * market_cap, sector) — they cost zero extra credits. Anything involving
 * chg_7d/30d/90d/365d necessarily costs a click, so it appears only in the
 * Sheet and never as a column in the table.
 */

import { useMemo, useState } from "react";
import { ChevronRight, Rocket } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Change, InsightLabel, MethodTip, Panel, Tag, td, th } from "./primitives";
import { useIpoCohort, useListingPerformance, type IpoCompany } from "@/hooks/useIpo";
import { formatIDRScale } from "@/lib/algorithms/scoring";
import { cn } from "@/lib/utils";

/** The four evaluation windows from the spec. */
const WINDOWS = [
  { key: "chg_7d", label: "7D", desc: "First-day pop" },
  { key: "chg_30d", label: "30D", desc: "Post lock-up" },
  { key: "chg_90d", label: "90D", desc: "Fundamental price discovery" },
  { key: "chg_365d", label: "365D", desc: "Long-term indicator" },
] as const;

/**
 * `meta` is duplicated from pages.tsx (it isn't exported there and changing
 * its visibility would touch every page). Kept identical deliberately.
 */
const meta = (label: string, value: string) => (
  <div>
    <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    <div className="mt-1 text-xs text-foreground">{value}</div>
  </div>
);

/** Formats a listing_date into a compact Indonesian date (e.g. "10 Jul 26"). */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

/** "PT Rans Entertainmen Indonesia Tbk" → "Rans Entertainmen Indonesia". */
function shortName(name: string): string {
  return name
    .replace(/^PT\s+/i, "")
    .replace(/\s+Tbk\.?$/i, "")
    .trim();
}

/** How many calendar days since listing — drives the maturity Tone. */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * Tone by cohort maturity. Newly listed (< 30 days) get `warning` because
 * their price data is thin and the 90/365D windows haven't elapsed yet.
 */
function maturityTone(days: number | null): "positive" | "warning" | "neutral" {
  if (days == null) return "neutral";
  return days < 30 ? "warning" : "neutral";
}

export function IpoTracker() {
  const cohort = useIpoCohort();

  // The single symbol the user clicked. Drives BOTH the Sheet's open state and
  // the `enabled` flag on the performance query — one source of truth means the
  // query literally cannot fire until the user asks for it.
  const [selected, setSelected] = useState<IpoCompany | null>(null);

  const rows = useMemo(() => cohort.data ?? [], [cohort.data]);

  // Lazy — only enabled while a row is selected, for that row's symbol only.
  const perf = useListingPerformance(selected?.symbol ?? null, !!selected);

  /**
   * Cohort stats derived from the list alone — the one genuinely cohort-wide
   * insight available without paying for per-symbol performance.
   */
  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const caps = rows.map((r) => r.market_cap).filter((c): c is number => c != null);
    const newest = rows.reduce<string | null>((acc, r) => {
      if (!r.listing_date) return acc;
      return acc === null || r.listing_date > acc ? r.listing_date : acc;
    }, null);
    // Sector with the most new listings — the IPO pipeline per sector.
    const bySector = new Map<string, number>();
    rows.forEach((r) => {
      if (r.sector) bySector.set(r.sector, (bySector.get(r.sector) ?? 0) + 1);
    });
    const topSector = Array.from(bySector.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      total: rows.length,
      totalCap: caps.length > 0 ? caps.reduce((a, b) => a + b, 0) : null,
      medianCap:
        caps.length > 0 ? caps.slice().sort((a, b) => a - b)[Math.floor(caps.length / 2)]! : null,
      newest,
      topSector,
      sectorCount: bySector.size,
    };
  }, [rows]);

  return (
    <>
      <Panel
        title="IPO Alpha Tracker"
        kicker="Kohort listing terbaru"
        action={
          <div className="flex items-center gap-2">
            {cohort.isFetching && (
              <span className="text-[10px] text-muted-foreground">memuat…</span>
            )}
            <MethodTip
              wide
              text="Kohort IPO diambil dari screener /v2/companies/ (1 kredit). Performa harga pasca-listing (/v2/listing-performance/) berbiaya 1 kredit PER simbol, sehingga sengaja di-load hanya saat Anda mengklik satu baris — detailnya muncul di panel samping. Jendela evaluasi: 7D (first-day pop), 30D (post lock-up), 90D (price discovery), 365D (indikator jangka panjang). Data hanya tersedia untuk ticker yang listing setelah Mei 2005."
            />
          </div>
        }
      >
        {/* ── Derived cohort summary strip ──────────────────────────────── */}
        {stats && (
          <div className="grid gap-4 border-b border-border bg-secondary/20 px-4 py-3 sm:grid-cols-4">
            <div>
              <div className="text-[9px] uppercase text-muted-foreground">Total IPO</div>
              <div className="mt-1 text-lg font-semibold text-data text-foreground">
                {stats.total}
              </div>
              <div className="text-[10px] text-muted-foreground">{stats.sectorCount} sektor</div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted-foreground">Total Kapitalisasi</div>
              <div className="mt-1 text-sm font-semibold text-data text-foreground">
                {formatIDRScale(stats.totalCap)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                median {formatIDRScale(stats.medianCap)}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted-foreground">Listing Terbaru</div>
              <div className="mt-1 text-sm font-semibold text-data text-foreground">
                {fmtDate(stats.newest)}
              </div>
              <div className="text-[10px] text-muted-foreground">tanggal pencatatan</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-[9px] uppercase text-muted-foreground">
                <InsightLabel>Sektor Teraktif</InsightLabel>
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {stats.topSector?.[0] ?? "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {stats.topSector ? `${stats.topSector[1]} dari ${stats.total} IPO` : ""}
              </div>
            </div>
          </div>
        )}

        {/* ── Cohort table ──────────────────────────────────────────────── */}
        {cohort.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-secondary/50" />
            ))}
          </div>
        ) : cohort.isError ? (
          <div className="p-10 text-center text-xs text-muted-foreground">
            Data IPO tidak dapat dimuat.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground">
            Tidak ada emiten yang listing pada periode ini.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr>
                  <th className={th}>Emiten</th>
                  <th className={th}>Perusahaan</th>
                  <th className={th}>Sektor</th>
                  <th className={th}>Tanggal Listing</th>
                  <th className={cn(th, "text-right")}>Market Cap</th>
                  <th className={cn(th, "text-right")}>Rank</th>
                  <th className={cn(th, "text-right")}>Performa</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const days = daysSince(r.listing_date);
                  return (
                    <tr
                      key={r.symbol}
                      onClick={() => setSelected(r)}
                      className="cursor-pointer transition-colors hover:bg-secondary/50"
                    >
                      <td className={cn(td, "font-semibold text-primary")}>
                        {r.symbol.replace(".JK", "")}
                      </td>
                      <td className={cn(td, "max-w-[220px] truncate")}>
                        {shortName(r.company_name)}
                      </td>
                      <td className={cn(td, "text-muted-foreground")}>
                        {r.sub_sector ?? r.sector ?? "—"}
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums">{fmtDate(r.listing_date)}</span>
                          <Tag tone={maturityTone(days)}>{days == null ? "—" : `${days}h`}</Tag>
                        </div>
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {formatIDRScale(r.market_cap)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums text-muted-foreground")}>
                        {r.market_cap_rank ?? "—"}
                      </td>
                      <td className={cn(td, "text-right")}>
                        {/* No number here by design — performance costs 1
                            credit/symbol and must not be fetched eagerly. */}
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          Lihat
                          <ChevronRight className="size-3" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Footer explaining the credit policy ────────────────────────── */}
        <div className="border-t border-border px-4 py-2.5">
          <p className="text-[10px] leading-relaxed text-muted-foreground/70">
            Performa harga tidak ditampilkan di tabel karena setiap simbol berbiaya 1 kredit
            terpisah. Klik salah satu emiten untuk memuat keempat jendela evaluasinya — hasil
            disimpan di cache, sehingga emiten yang sama tidak memakan kredit dua kali.
          </p>
        </div>
      </Panel>

      {/* ── Lazy performance Sheet (1 credit, fired on row click) ──────────── */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="border-border bg-popover">
          <SheetHeader>
            <SheetTitle>
              {selected
                ? `${selected.symbol.replace(".JK", "")} — Performa Listing`
                : "Performa Listing"}
            </SheetTitle>
            <SheetDescription>{selected?.company_name}</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="flex flex-col gap-4 overflow-y-auto p-5">
              {/* Company meta */}
              <div className="grid grid-cols-2 gap-4">
                {meta("Sektor", selected.sector ?? "—")}
                {meta("Sub-sektor", selected.sub_sector ?? "—")}
                {meta("Tanggal Listing", fmtDate(selected.listing_date))}
                {meta("Market Cap", formatIDRScale(selected.market_cap))}
              </div>

              {/* Performance windows */}
              <div className="border-t border-border pt-4">
                <div className="mb-3 flex items-center gap-1">
                  <InsightLabel>Performa Pasca-Listing</InsightLabel>
                </div>
                {perf.isPending ? (
                  <div className="flex items-center gap-2 py-4 text-[11px] text-muted-foreground">
                    <Rocket className="size-3.5 animate-pulse" />
                    Memuat data performa… (1 kredit)
                  </div>
                ) : perf.isError ? (
                  <div className="border border-negative/30 bg-negative/10 p-3">
                    <p className="text-[11px] text-negative">
                      Data performa tidak tersedia untuk emiten ini.
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Listing-performance hanya tersedia untuk ticker yang listing setelah Mei 2005.
                    </p>
                  </div>
                ) : perf.data ? (
                  <div className="grid grid-cols-2 gap-3">
                    {WINDOWS.map((w) => {
                      // API returns decimals (0.1235 = +12.35%); Change expects
                      // already-scaled percent, so multiply by 100 here.
                      const raw = perf.data?.[w.key] ?? null;
                      const val = raw == null ? null : raw * 100;
                      return (
                        <div key={w.key} className="border border-border bg-card p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium uppercase text-muted-foreground">
                              {w.label}
                            </span>
                            <Tag
                              tone={val == null ? "neutral" : val >= 0 ? "positive" : "negative"}
                            >
                              {w.desc}
                            </Tag>
                          </div>
                          <div className="mt-2">
                            <Change value={val} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                Chg_7D/30D/90D/365D = persentase perubahan harga sejak tanggal listing. Nilai "—"
                berarti jendela evaluasi tersebut belum tercapai (emiten belum cukup lama listing).
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
