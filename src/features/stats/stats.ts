// Statistics and year in review (HistoryService.GetStats, server: docs/design/home.md) formatted:
// durations, bars per month, hour map, breakdown, top items. No browser needed; tested in
// stats.test.ts.
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { seconds } from "../../api/media";
import type { Image } from "../../gen/laterna/v1/catalog_pb";
import type { HistoryEntry, Stats, TimeBucket } from "../../gen/laterna/v1/history_pb";
import i18n, { locale, num } from "../../i18n";

/** "154 h", "3 h 20 min", "45 min", "0 min": time played, rounded to what reads well. */
export function hoursLabel(total: number): string {
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h >= 10) return `${num(Math.round(minutes / 60))} h`;
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** The device's time zone: the server counts days, hours and months in it. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

export interface Bar {
  /** "Jan", or the year for all time. */
  label: string;
  /** "January 2026", for the tooltip and the table. */
  long: string;
  seconds: number;
}

/**
 * Bars of time played: twelve months for a year, one per year for all time (in the time zone sent
 * to the server, the device's).
 */
export function timelineBars(timeline: readonly TimeBucket[], byYear: boolean, timeZone?: string): Bar[] {
  const tz = timeZone || undefined;
  const short = new Intl.DateTimeFormat(
    locale(),
    byYear ? { year: "numeric", timeZone: tz } : { month: "short", timeZone: tz },
  );
  const long = new Intl.DateTimeFormat(
    locale(),
    byYear ? { year: "numeric", timeZone: tz } : { month: "long", year: "numeric", timeZone: tz },
  );
  return timeline.map((b) => {
    const start = b.start ? timestampDate(b.start) : new Date(0);
    return { label: short.format(start), long: long.format(start), seconds: seconds(b.time) };
  });
}

/** Round ticks of the hours axis: 0 and three steps up to the highest (in hours). */
export function hourTicks(maxSeconds: number): number[] {
  const maxHours = maxSeconds / 3600;
  const steps = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => s * 3 >= maxHours) ?? Math.ceil(maxHours / 3);
  return [0, step, step * 2, step * 3];
}

/** "0", "15 min", "2 h", "2.5 h": a tick of the hours axis. */
export function tickLabel(hours: number): string {
  if (hours === 0) return "0";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${num(hours)} h`;
}

/** Days of the week, Monday first, in the interface language: "Mon", "Monday". */
export function dayNames(width: "short" | "long"): string[] {
  const f = new Intl.DateTimeFormat(locale(), { weekday: width, timeZone: "UTC" });
  // January 1, 2024 is a Monday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}
/** Three-hour slots of the map: "0 h", "3 h"... "21 h". */
export const slots = [0, 3, 6, 9, 12, 15, 18, 21] as const;

export interface HeatCell {
  day: number;
  slot: number;
  seconds: number;
  /** 0 (nothing) to 4 (the most). */
  level: number;
}

/**
 * "When do you watch?" map: the 168 hours of the week (Monday 0:00 first) grouped into three-hour
 * slots, each ranked on five levels, 0 for nothing.
 */
export function heatmap(byHour: readonly { seconds: bigint; nanos: number }[]): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let day = 0; day < 7; day++)
    for (let slot = 0; slot < slots.length; slot++) {
      let total = 0;
      for (let h = slot * 3; h < slot * 3 + 3; h++) {
        const d = byHour[day * 24 + h];
        if (d) total += Number(d.seconds) + d.nanos / 1e9;
      }
      cells.push({ day, slot, seconds: total, level: 0 });
    }
  const max = Math.max(0, ...cells.map((c) => c.seconds));
  for (const c of cells)
    c.level = c.seconds <= 0 || max <= 0 ? 0 : Math.min(4, 1 + Math.floor((c.seconds / max) * 3.999));
  return cells;
}

const dayPart = (slot: number) =>
  slot < 2 ? "night" : slot < 4 ? "morning" : slot < 6 ? "afternoon" : "evening";

/** "mostly on Sunday evenings": the busiest slot; empty with nothing. */
export function peakMoment(cells: readonly HeatCell[]): string {
  const best = cells.reduce<HeatCell | undefined>(
    (a, c) => (c.seconds > (a?.seconds ?? 0) ? c : a),
    undefined,
  );
  if (!best) return "";
  return i18n.t(`stats.peak.${dayPart(best.slot)}`, { day: dayNames("long")[best.day] });
}

export interface Share {
  label: string;
  seconds: number;
  /** Rounded share, in percent. */
  percent: number;
}

/** Breakdown of the time played: series, movies, music, in that order, without empty kinds. */
export function timeSplit(s: Stats): Share[] {
  const parts = [
    { label: i18n.t("nav.series"), seconds: seconds(s.episodesTime) },
    { label: i18n.t("nav.movies"), seconds: seconds(s.moviesTime) },
    { label: i18n.t("nav.music"), seconds: seconds(s.musicTime) },
  ];
  const total = parts.reduce((a, p) => a + p.seconds, 0);
  return parts
    .filter((p) => p.seconds > 0)
    .map((p) => ({ ...p, percent: total > 0 ? Math.round((p.seconds / total) * 100) : 0 }));
}

export interface Favorite {
  id: string;
  name: string;
  /** "series · 16 h", "movie · watched 3 times", "artist · 214 plays". */
  detail: string;
  kind: "series" | "movie" | "artist" | "track";
  images: readonly Image[];
}

/** Top items: two series, two movies, two artists at most, in that order. */
export function favorites(s: Stats): Favorite[] {
  return [
    ...s.topSeries.slice(0, 2).map((e) => ({
      id: e.itemId,
      name: e.name,
      detail: i18n.t("stats.favSeries", { time: hoursLabel(seconds(e.time)) }),
      kind: "series" as const,
      images: e.images,
    })),
    ...s.topMovies.slice(0, 2).map((e) => ({
      id: e.itemId,
      name: e.name,
      detail:
        e.plays > 1
          ? i18n.t("stats.favMovieTimes", { n: num(e.plays) })
          : i18n.t("stats.favMovie", { time: hoursLabel(seconds(e.time)) }),
      kind: "movie" as const,
      images: e.images,
    })),
    ...s.topArtists.slice(0, 2).map((e) => ({
      id: e.itemId,
      name: e.name,
      detail: i18n.t("stats.favArtist", { count: e.plays }),
      kind: "artist" as const,
      images: e.images,
    })),
  ];
}

/** Years with sessions (a year in review is possible), most recent first. */
export function yearsWithPlays(allTime: Stats | undefined, timeZone?: string): number[] {
  const tz = timeZone || undefined;
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: tz });
  return (allTime?.timeline ?? [])
    .filter((b) => seconds(b.time) > 0 && b.start)
    .map((b) => Number(year.format(timestampDate(b.start as NonNullable<typeof b.start>))))
    .sort((a, b) => b - a);
}

/** "Thirteen whole days in front of Laterna": the total time in days, if it makes at least one. */
export function wholeDays(total: number): string {
  const n = Math.floor(total / 86400);
  if (n < 1) return "";
  // Up to fifteen in words, in digits above.
  const word = i18n.t("stats.numberWords").split("|")[n - 1] ?? num(n);
  return i18n.t("stats.wholeDays", { count: n, word });
}

/** Busiest month of a year: its name ("February") and its time. */
export function busiestBar(bars: readonly Bar[]): Bar | undefined {
  return bars.reduce<Bar | undefined>((a, b) => (b.seconds > (a?.seconds ?? 0) ? b : a), undefined);
}

/** "Severance, S1 · E2": what a session played, as kept by the server. */
export function entryTitle(e: HistoryEntry | undefined): string {
  if (!e) return "";
  return e.subtitle ? `${e.title} · ${e.subtitle}` : e.title;
}
