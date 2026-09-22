/**
 * Watchlist store — persisted to localStorage via Zustand persist.
 * Supports add/remove, per-ticker research notes, and alert thresholds.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WatchlistEntry {
  ticker: string;
  addedAt: string;          // ISO timestamp
  note: string;             // user's research note
  alertAbove?: number;      // price alert — above threshold
  alertBelow?: number;      // price alert — below threshold
}

interface WatchlistState {
  entries: WatchlistEntry[];
  add:    (ticker: string) => void;
  remove: (ticker: string) => void;
  updateNote: (ticker: string, note: string) => void;
  setAlert: (ticker: string, above?: number, below?: number) => void;
  has:    (ticker: string) => boolean;
  clear:  () => void;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      entries: [],

      add: (ticker) => {
        if (get().has(ticker)) return;
        set((s) => ({
          entries: [
            ...s.entries,
            { ticker, addedAt: new Date().toISOString(), note: "" },
          ],
        }));
      },

      remove: (ticker) =>
        set((s) => ({ entries: s.entries.filter((e) => e.ticker !== ticker) })),

      updateNote: (ticker, note) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.ticker === ticker ? { ...e, note } : e)),
        })),

      setAlert: (ticker, above, below) =>
        set((s) => ({
          entries: s.entries.map((e): WatchlistEntry => {
            if (e.ticker !== ticker) return e;
            const updated: WatchlistEntry = { ticker: e.ticker, addedAt: e.addedAt, note: e.note };
            if (above !== undefined) updated.alertAbove = above;
            if (below !== undefined) updated.alertBelow = below;
            return updated;
          }),
        })),

      has: (ticker) => get().entries.some((e) => e.ticker === ticker),

      clear: () => set({ entries: [] }),
    }),
    {
      name: "pengen-seblak-watchlist",
    },
  ),
);
