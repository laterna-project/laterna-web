// Photo logic without a browser: shooting time, groups by day, justified rows, EXIF details,
// coordinates. Tested in logic.test.ts.
import type { Duration, Timestamp } from "@bufbuild/protobuf/wkt";
import type { Photo, PhotoSummary } from "../gen/laterna/v1/catalog_pb";
import type { PhotoMonth } from "../gen/laterna/v1/photo_pb";
import i18n, { locale } from "../i18n";

const secs = (d: { seconds: bigint; nanos: number } | undefined) =>
  d ? Number(d.seconds) + d.nanos / 1e9 : 0;

/**
 * Shooting time as the camera showed it: with its offset if known (then read as UTC), otherwise the
 * instant read in this browser's time zone.
 */
export function shotTime(
  takenAt: Timestamp | undefined,
  utcOffset: Duration | undefined,
): { date: Date; timeZone: string | undefined } {
  const t = secs(takenAt);
  if (utcOffset) return { date: new Date((t + secs(utcOffset)) * 1000), timeZone: "UTC" };
  return { date: new Date(t * 1000), timeZone: undefined };
}

function parts(p: Pick<PhotoSummary, "takenAt" | "utcOffset">) {
  return shotTime(p.takenAt, p.utcOffset);
}

/** Shooting day (YYYY-MM-DD), for grouping. */
export function dayKey(p: Pick<PhotoSummary, "takenAt" | "utcOffset">): string {
  const { date, timeZone } = parts(p);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "Monday, September 14, 2026". */
export function dayLabel(p: Pick<PhotoSummary, "takenAt" | "utcOffset">): string {
  const { date, timeZone } = parts(p);
  const s = date.toLocaleDateString(locale(), {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "5:42 PM", "17:42". */
export function timeLabel(p: Pick<PhotoSummary, "takenAt" | "utcOffset">): string {
  const { date, timeZone } = parts(p);
  return date.toLocaleTimeString(locale(), { timeZone, hour: "numeric", minute: "2-digit" });
}

export interface DayGroup {
  key: string;
  label: string;
  photos: PhotoSummary[];
}

/** Consecutive photos of the same day (the list arrives most recent first). */
export function groupByDay(photos: readonly PhotoSummary[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const p of photos) {
    const key = dayKey(p);
    const last = out[out.length - 1];
    if (last?.key === key) last.photos.push(p);
    else out.push({ key, label: dayLabel(p), photos: [p] });
  }
  return out;
}

export interface Row {
  /** Indexes [start, end[ of the row's photos. */
  start: number;
  end: number;
  height: number;
}

/**
 * Justified rows: photos at the same height that fill the width. Photos are added as long as the
 * row, at the target height, does not reach the width; the last row keeps the target height (not
 * stretched).
 */
export function justify(ratios: readonly number[], width: number, target: number, gap: number): Row[] {
  const rows: Row[] = [];
  if (width <= 0) return rows;
  let start = 0;
  let sum = 0;
  for (let i = 0; i < ratios.length; i++) {
    sum += Math.max(0.2, ratios[i] ?? 1);
    const count = i - start + 1;
    const natural = sum * target + gap * (count - 1);
    if (natural >= width) {
      const height = (width - gap * (count - 1)) / sum;
      rows.push({ start, end: i + 1, height });
      start = i + 1;
      sum = 0;
    }
  }
  if (start < ratios.length) rows.push({ start, end: ratios.length, height: target });
  return rows;
}

/** Years present, most recent first. */
export function yearsOf(months: readonly PhotoMonth[]): number[] {
  return [...new Set(months.map((m) => m.year))].sort((a, b) => b - a);
}

/** "from 2012 to today", "from 2012 to 2025", "in 2019". */
export function spanLabel(months: readonly PhotoMonth[], now = new Date()): string {
  const years = yearsOf(months);
  const last = years[0];
  const first = years[years.length - 1];
  if (last === undefined || first === undefined) return "";
  if (first === last)
    return last === now.getFullYear() ? i18n.t("photos.thisYear") : i18n.t("photos.inYear", { year: last });
  return i18n.t("photos.fromTo", { first, last: last === now.getFullYear() ? i18n.t("photos.today") : last });
}

const num = (n: number, digits = 1) => n.toLocaleString(locale(), { maximumFractionDigits: digits });

/** EXIF details in plain words, without unknown lines. */
export function exifLines(p: Photo): [string, string][] {
  const s = p.summary;
  // "NIKON CORPORATION" + "NIKON D800": the model already names the brand.
  const brand = p.cameraMake.split(/\s+/)[0]?.toLowerCase() ?? "";
  const camera =
    brand && p.cameraModel.toLowerCase().includes(brand)
      ? p.cameraModel
      : [p.cameraMake, p.cameraModel].filter(Boolean).join(" ");
  const t = i18n.t;
  const lines: [string, string][] = [
    [t("photos.exif.camera"), camera],
    [t("photos.exif.lens"), p.lens],
    [t("photos.exif.aperture"), p.fNumber > 0 ? `f/${num(p.fNumber)}` : ""],
    [t("photos.exif.shutter"), p.exposureTime ? `${p.exposureTime} s` : ""],
    [t("photos.exif.iso"), p.iso > 0 ? String(p.iso) : ""],
    [t("photos.exif.focal"), p.focalLength > 0 ? `${num(p.focalLength, 0)} mm` : ""],
    [t("photos.exif.dimensions"), s && s.width > 0 ? `${s.width} × ${s.height}` : ""],
  ];
  return lines.filter(([, v]) => v);
}

/** "49.7075° N · 0.2031° E". */
export function coordinates(lat: number, lon: number): string {
  const f = (v: number) =>
    Math.abs(v).toLocaleString(locale(), { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `${f(lat)}° ${lat >= 0 ? "N" : "S"} · ${f(lon)}° ${lon >= 0 ? "E" : i18n.t("photos.west")}`;
}

/** The place on OpenStreetMap (opened only on request). */
export function mapUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}
