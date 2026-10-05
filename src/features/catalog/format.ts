import { type MediaStream, StreamKind } from "../../gen/laterna/v1/catalog_pb";
import i18n, { locale } from "../../i18n";

/** ISO 639-2/B codes (those of the files) to their BCP 47 form, understood by Intl. */
const bibliographic: Record<string, string> = {
  fre: "fr",
  ger: "de",
  dut: "nl",
  chi: "zh",
  cze: "cs",
  gre: "el",
  rum: "ro",
  slo: "sk",
  may: "ms",
  per: "fa",
  arm: "hy",
  baq: "eu",
  bur: "my",
  geo: "ka",
  ice: "is",
  mac: "mk",
  mao: "mi",
  tib: "bo",
  wel: "cy",
  alb: "sq",
};

/**
 * "French", "Japanese" (in the interface language); empty for an unknown or undetermined language
 * ("und").
 */
export function languageName(code: string): string {
  const c = code.trim().toLowerCase();
  if (!c || c === "und" || c === "zxx" || c === "mul") return "";
  try {
    const name = new Intl.DisplayNames([locale()], { type: "language" }).of(bibliographic[c] ?? c);
    if (!name || name.toLowerCase() === c) return c.toUpperCase();
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return c.toUpperCase();
  }
}

/** Name of a language in that language: "English", "日本語"; empty if unknown. */
function nativeName(code: string): string {
  const c = bibliographic[code.trim().toLowerCase()] ?? code.trim().toLowerCase();
  try {
    return new Intl.DisplayNames([c], { type: "language" }).of(c) ?? "";
  } catch {
    return "";
  }
}

/** "4K", "1080p", "720p", "480p" from the width and height of the picture. */
export function resolutionLabel(width: number, height: number): string {
  if (width >= 3200 || height >= 2000) return "4K";
  if (width >= 1800 || height >= 1000) return "1080p";
  if (width >= 1200 || height >= 700) return "720p";
  if (height > 0) return `${height}p`;
  return "";
}

/** "5.1", "Stereo", "Mono" from the number of channels. */
export function channelsLabel(channels: number): string {
  if (channels === 1) return "Mono";
  if (channels === 2) return i18n.t("format.stereo");
  if (channels === 6) return "5.1";
  if (channels === 8) return "7.1";
  return channels > 0 ? i18n.t("format.channels", { count: channels }) : "";
}

const codecNames: Record<string, string> = {
  h264: "H.264",
  hevc: "HEVC",
  av1: "AV1",
  vp8: "VP8",
  vp9: "VP9",
  mpeg4: "MPEG-4",
  aac: "AAC",
  ac3: "Dolby Digital",
  eac3: "Dolby Digital Plus",
  dts: "DTS",
  truehd: "Dolby TrueHD",
  opus: "Opus",
  vorbis: "Vorbis",
  flac: "FLAC",
  mp3: "MP3",
  subrip: "SRT",
  srt: "SRT",
  ass: "ASS",
  ssa: "SSA",
  webvtt: "WebVTT",
  mov_text: "",
  hdmv_pgs_subtitle: "PGS",
  dvd_subtitle: "VobSub",
};

export function codecName(codec: string): string {
  const c = codec.toLowerCase();
  if (c === "mov_text") return i18n.t("format.textSubtitle");
  return codecNames[c] ?? codec.toUpperCase();
}

/** Short description of a track: "French · Dolby Digital 5.1", "English · SRT · forced". */
export function streamLabel(s: MediaStream): string {
  const parts: string[] = [];
  const lang = languageName(s.language);
  // The track title often already says the language, in the interface language ("French (styled)")
  // or in the language itself ("English", "日本語"): do not repeat it.
  const title = s.title.trim();
  if (!title || title.toLowerCase() === nativeName(s.language).toLowerCase()) parts.push(lang);
  else if (lang && !title.toLowerCase().includes(lang.toLowerCase())) parts.push(`${lang} (${title})`);
  else parts.push(title);
  if (s.kind === StreamKind.VIDEO) {
    parts.push([codecName(s.codec), resolutionLabel(s.width, s.height)].filter(Boolean).join(" "));
  } else if (s.kind === StreamKind.AUDIO) {
    parts.push([codecName(s.codec), channelsLabel(s.channels)].filter(Boolean).join(" "));
  } else {
    parts.push(codecName(s.codec));
    if (s.forced) parts.push(i18n.t("format.forced"));
    if (s.hearingImpaired) parts.push(i18n.t("format.hearingImpaired"));
  }
  return parts.filter(Boolean).join(" · ") || i18n.t("format.unnamedTrack");
}

/** Size of a file: "1.2 GB", "650 MB" (decimal separator of the language). */
export function fileSize(bytes: bigint | number): string {
  const n = Number(bytes);
  const fmt = (v: number, unit: string) =>
    new Intl.NumberFormat(locale(), { style: "unit", unit, maximumFractionDigits: 1 }).format(v);
  if (n >= 1e9) return fmt(n / 1e9, "gigabyte");
  if (n >= 1e6) return fmt(n / 1e6, "megabyte");
  return fmt(n / 1e3, "kilobyte");
}

/** YYYY-MM-DD date in plain words: "September 14, 2026". */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Calendar days elapsed between two dates (0: the same day). */
function daysBetween(date: Date, now: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  return day(now) - day(date);
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "on March 4, 2025". */
export function relativeDay(date: Date, now = new Date()): string {
  const days = daysBetween(date, now);
  if (days <= 0) return i18n.t("format.today");
  if (days === 1) return i18n.t("format.yesterday");
  if (days < 7) return i18n.t("format.daysAgo", { count: days });
  if (days < 30) return i18n.t("format.weeksAgo", { count: Math.floor(days / 7) });
  return i18n.t("format.onDate", {
    date: date.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }),
  });
}

/** "just now", "12 min ago", "3 h ago", then like relativeDay ("yesterday"...). */
export function relativeTime(date: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return i18n.t("format.justNow");
  if (minutes < 60) return i18n.t("format.minutesAgo", { count: minutes });
  if (minutes < 24 * 60 && daysBetween(date, now) <= 0)
    return i18n.t("format.hoursAgo", { count: Math.floor(minutes / 60) });
  return relativeDay(date, now);
}

/** "S1 · E2", "S1 · E2-3" for a double episode; "S1 E2" in short form (after the series name). */
export function episodeCode(
  e: { seasonNumber: number; number: number; numberEnd?: number },
  short = false,
): string {
  const episode = `${e.number}${e.numberEnd ? `–${e.numberEnd}` : ""}`;
  return i18n.t(short ? "format.episodeShort" : "format.episodeCode", { season: e.seasonNumber, episode });
}
