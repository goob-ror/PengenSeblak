/**
 * useJakartaClock — true Asia/Jakarta wall clock that re-renders on a tick.
 *
 * WHY THIS EXISTS: the old code did `new Date(Date.now() + 7*60*60*1000)`
 * and computed session state ONCE at mount, so the displayed time froze at
 * whatever it was when the component rendered and never advanced. This hook
 * (a) formats via Intl with an explicit IANA timeZone — the browser resolves
 * real WIB including any future offset change — and (b) ticks so the clock
 * and session label stay correct while the page is open.
 *
 * No API calls: time is derived locally. Interval is unmount-safe.
 */

import { useEffect, useState } from "react";

export interface JakartaClock {
  date: Date;
  /** "YYYY-MM-DD" in Jakarta */
  dateISO: string;
  /** "14:32" 24h Jakarta time */
  timeHHMM: string;
  /** "14:32:07" */
  timeHHMMSS: string;
  /** e.g. "Kamis, 25 Sep 2026" */
  dateLabel: string;
  /** Minutes since Jakarta midnight */
  minutesOfDay: number;
  dayOfWeek: number;
}

const jakartaFormatter = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", ...opts });

export function useJakartaClock(tickMs = 30_000): JakartaClock {
  const [date, setDate] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setDate(new Date()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  return readClock(date);
}

export function readClock(date: Date): JakartaClock {
  const parts = jakartaFormatter({
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, weekday: "long",
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hh = get("hour") === "24" ? "00" : get("hour");
  const mm = get("minute");
  const ss = get("second");

  // en-CA gives us YYYY-MM-DD already
  const dateISO = `${get("year")}-${get("month")}-${get("day")}`;

  // Jakarta wall-clock day of week & minutes-of-day derived from the
  // formatted values so they're already shifted into WIB.
  const utcNoon = Date.UTC(
    Number(get("year")), Number(get("month")) - 1, Number(get("day")), 12,
  );
  const dayOfWeek = new Date(utcNoon).getUTCDay();
  const minutesOfDay = Number(hh) * 60 + Number(mm);

  return {
    date,
    dateISO,
    timeHHMM: `${hh}:${mm}`,
    timeHHMMSS: `${hh}:${mm}:${ss}`,
    dateLabel: dateLabel(date),
    minutesOfDay,
    dayOfWeek,
  };
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long", day: "numeric", month: "short", year: "numeric",
  }).format(date);
}

// ── IDX session model ─────────────────────────────────────────────────────
export type IDXPhase =
  | "closed_weekend"
  | "pre_open"
  | "session_1"
  | "break"
  | "session_2"
  | "post_close";

/**
 * IDX regular trading:
 *   Session 1  09:00–12:00 WIB
 *   Break      12:00–13:30 WIB
 *   Session 2  13:30–15:50 WIB
 * (The old code used 540–690 and 810–950 as two blocks, which is the same
 *  schedule, but it never recomputed, so the badge stuck at mount value.)
 */
export interface SessionInfo {
  phase: IDXPhase;
  label: string;
  isOpen: boolean;
}

export function idxSession(clock: JakartaClock): SessionInfo {
  const m = clock.minutesOfDay;
  const weekend = clock.dayOfWeek === 0 || clock.dayOfWeek === 6;

  if (weekend) {
    return { phase: "closed_weekend", label: "Tutup · Akhir pekan", isOpen: false };
  }
  const preOpen = 9 * 60;        // 09:00
  const breakStart = 12 * 60;    // 12:00
  const breakEnd = 13 * 60 + 30; // 13:30
  const close = 15 * 60 + 50;    // 15:50

  if (m < preOpen)         return { phase: "pre_open",   label: "Pre-open",            isOpen: false };
  if (m < breakStart)      return { phase: "session_1",  label: "Sesi 1 · aktif",      isOpen: true  };
  if (m < breakEnd)        return { phase: "break",      label: "Istirahat siang",     isOpen: false };
  if (m < close)           return { phase: "session_2",  label: "Sesi 2 · aktif",      isOpen: true  };
  return { phase: "post_close", label: "Pasar tutup", isOpen: false };
}
