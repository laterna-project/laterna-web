// "Coming soon" (server: docs/design/home.md): what Sonarr, Radarr and Lidarr expect and do not have
// yet. Nothing of it is in the catalog, so its cards are built here from what the server says of
// each release, not from catalog items.
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { UpcomingKind, type UpcomingRelease } from "../../gen/laterna/v1/home_pb";
import i18n, { locale } from "../../i18n";
import type { Universe } from "../../theme/contract";
import { episodeCode } from "../catalog/format";

type Dated = Pick<UpcomingRelease, "releaseTime" | "allDay">;

/**
 * The moment a release is due. A movie or an album names a day, not a moment: the server sends
 * midnight UTC of that day, read here as that same day on the device, whatever its time zone.
 */
export function releaseDate(u: Dated): Date | undefined {
  if (!u.releaseTime) return undefined;
  const d = timestampDate(u.releaseTime);
  return u.allDay ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : d;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days from now to the day of a date: 0 today, 1 tomorrow, negative in the past. */
function daysUntil(date: Date, now: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/**
 * When a release is due, in words: "On its way" once its time has passed (it aired or came out,
 * and has not arrived yet), then "Today, 16:30", "Tomorrow", the day of the week within a week,
 * and a date after that. A day without a time is written alone.
 */
export function whenLabel(u: Dated, now = new Date()): string {
  const date = releaseDate(u);
  if (!date) return "";
  const days = daysUntil(date, now);
  if (days < 0 || (!u.allDay && date.getTime() <= now.getTime())) return i18n.t("upcoming.onItsWay");
  const day =
    days === 0
      ? i18n.t("upcoming.today")
      : days === 1
        ? i18n.t("upcoming.tomorrow")
        : days < 7
          ? capitalize(date.toLocaleDateString(locale(), { weekday: "long" }))
          : date.toLocaleDateString(locale(), { day: "numeric", month: "short" });
  if (u.allDay) return day;
  const time = date.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
  return i18n.t("upcoming.dayAt", { day, time });
}

/** Weekdays come in lower case in most languages; a label starts with a capital. */
function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
}

/** What a card says: the series, the movie or the artist, then the episode or the album. */
export function upcomingLines(u: UpcomingRelease): { title: string; meta: string } {
  switch (u.kind) {
    case UpcomingKind.EPISODE: {
      const code = episodeCode({ seasonNumber: u.seasonNumber, number: u.episodeNumber });
      return { title: u.parentTitle, meta: u.title ? `${code} · ${u.title}` : code };
    }
    case UpcomingKind.ALBUM:
      return { title: u.parentTitle || u.title, meta: u.parentTitle ? u.title : "" };
    default:
      return { title: u.title, meta: i18n.t("upcoming.movie") };
  }
}

/** Color of a card, by what is coming. */
export function upcomingUniverse(kind: UpcomingKind): Universe {
  switch (kind) {
    case UpcomingKind.EPISODE:
      return "series";
    case UpcomingKind.ALBUM:
      return "music";
    default:
      return "movies";
  }
}

/** A stable key for a release: the server gives it no ID. */
export function upcomingKey(u: UpcomingRelease): string {
  const at = u.releaseTime?.seconds ?? "";
  return [u.kind, u.parentTitle, u.title, u.seasonNumber, u.episodeNumber, at].join("|");
}
