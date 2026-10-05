import { create } from "@bufbuild/protobuf";
import { serverText } from "../../api/text";
import type { AccountSummary } from "../../gen/laterna/v1/account_pb";
import { type ActivePlayback, ActivityKind, type DeviceSession } from "../../gen/laterna/v1/activity_pb";
import {
  type JellyfinTarget,
  JellyfinTargetKind,
  JellyfinTargetSchema,
} from "../../gen/laterna/v1/import_pb";
import { type Integration, IntegrationKind } from "../../gen/laterna/v1/integration_pb";
import { type ItemCounts, LibraryKind } from "../../gen/laterna/v1/library_pb";
import { LogLevel } from "../../gen/laterna/v1/system_pb";
import i18n, { euLanguages, type Language, language, locale } from "../../i18n";
import type { Universe } from "../../theme/contract";
import { ageLabel } from "../account/parental";
import { languageName } from "../catalog/format";

/** Metadata language of a library, in BCP 47: "fr-FR", and "en-US" for English. */
export function metadataTag(lang: Language = language()): string {
  return `${lang}-${euLanguages.find((l) => l.id === lang)?.region || "US"}`;
}

/** Languages offered for metadata: those of the European Union, named in the interface language. */
export function metadataLanguages(): { value: string; label: string }[] {
  return euLanguages
    .map((l) => ({ value: metadataTag(l.id), label: `${languageName(l.id)} (${metadataTag(l.id)})` }))
    .sort((a, b) => a.label.localeCompare(b.label, locale()));
}

/** Library kinds, in the app's order, with their universe. */
// Labels read on each render (getters): they follow the interface language.
export const libraryKinds: readonly { kind: LibraryKind; label: string; universe: Universe }[] = [
  {
    kind: LibraryKind.MOVIES,
    get label() {
      return i18n.t("nav.movies");
    },
    universe: "movies",
  },
  {
    kind: LibraryKind.SHOWS,
    get label() {
      return i18n.t("nav.series");
    },
    universe: "series",
  },
  {
    kind: LibraryKind.MUSIC,
    get label() {
      return i18n.t("nav.music");
    },
    universe: "music",
  },
  {
    kind: LibraryKind.BOOKS,
    get label() {
      return i18n.t("nav.books");
    },
    universe: "books",
  },
  {
    kind: LibraryKind.PHOTOS,
    get label() {
      return i18n.t("nav.photos");
    },
    universe: "photos",
  },
];

export function libraryKind(kind: LibraryKind | undefined) {
  return (
    libraryKinds.find((k) => k.kind === kind) ?? {
      kind,
      label: i18n.t("library.generic"),
      universe: "movies" as const,
    }
  );
}

/** "212 series · 6,480 episodes": what a library counts, depending on its kind. */
export function libraryCounts(kind: LibraryKind | undefined, c: ItemCounts | undefined): string {
  if (!c) return "";
  switch (kind) {
    case LibraryKind.MOVIES:
      return i18n.t("library.movies", { count: c.movies });
    case LibraryKind.SHOWS:
      return [
        i18n.t("library.series", { count: c.series }),
        i18n.t("library.episodes", { count: c.episodes }),
      ].join(" · ");
    case LibraryKind.MUSIC:
      return [
        i18n.t("library.artists", { count: c.artists }),
        i18n.t("library.albums", { count: c.albums }),
        i18n.t("library.tracks", { count: c.tracks }),
      ].join(" · ");
    case LibraryKind.BOOKS:
      return [
        i18n.t("library.bookSeries", { count: c.bookSeries }),
        i18n.t("library.books", { count: c.books }),
      ].join(" · ");
    case LibraryKind.PHOTOS:
      return [
        i18n.t("library.photoAlbums", { count: c.photoAlbums }),
        i18n.t("library.photos", { count: c.photos }),
      ].join(" · ");
    default:
      return "";
  }
}

/** Kinds of server jobs the app can name ("library.scan" -> key "jobs.library_scan"). */
const jobKinds = [
  "library.scan",
  "file.analyze",
  "file.keyframes",
  "file.subtitles",
  "file.trickplay",
  "item.metadata",
  "image.download",
  "image.analyze",
  "download.prepare",
  "download.convert",
  "arr.refresh",
  "metadata.purge",
  "subtitles.purge",
  "store.optimize",
  "file.segments",
] as const;

/** Job kind in plain words; a kind unknown to the app stays as is. */
export function jobName(kind: string): string {
  const known = jobKinds.find((k) => k === kind);
  return known ? i18n.t(`jobs.${known.replace(".", "_") as "library_scan"}`) : kind;
}

/** Color of an activity log entry: its universe, or the alert color. */
export function activityTone(kind: ActivityKind, warning: boolean): Universe | "danger" {
  if (warning) return "danger";
  switch (kind) {
    case ActivityKind.PLAYBACK_STARTED:
    case ActivityKind.PLAYBACK_STOPPED:
      return "series";
    case ActivityKind.PARTY_STARTED:
      return "party";
    case ActivityKind.IMPORT:
      return "movies";
    case ActivityKind.LIBRARY_CREATED:
    case ActivityKind.LIBRARY_UPDATED:
    case ActivityKind.LIBRARY_DELETED:
    case ActivityKind.LIBRARY_SCANNED:
      return "collections";
    case ActivityKind.SETTINGS_UPDATED:
    case ActivityKind.INTEGRATION:
    case ActivityKind.WEBHOOK:
      return "music";
    case ActivityKind.JOB_FAILED:
      return "danger";
    default:
      return "playlists";
  }
}

/** Levels offered to filter the logs (from this level up). */
export const logLevels = [
  { value: LogLevel.UNSPECIFIED, label: "logLevels.all" },
  { value: LogLevel.INFO, label: "logLevels.info" },
  { value: LogLevel.WARN, label: "logLevels.warn" },
  { value: LogLevel.ERROR, label: "logLevels.error" },
] as const;

/** Short name of a level: "info", "warn", "error". */
export function levelName(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG:
      return i18n.t("logLevels.debugShort");
    case LogLevel.INFO:
      return i18n.t("logLevels.infoShort");
    case LogLevel.WARN:
      return i18n.t("logLevels.warnShort");
    case LogLevel.ERROR:
      return i18n.t("logLevels.errorShort");
    default:
      return "";
  }
}

/** "7.1" from the first line of "ffmpeg -version". */
export function ffmpegVersion(line: string): string {
  const v = /ffmpeg version (\S+)/.exec(line)?.[1];
  if (!v) return "";
  const short = v.replace(/-.*$/, "");
  return short.length > 1 ? short : v;
}

/** Choices of interval between automatic scans (seconds; 0 = never). */
export const scanIntervals = [
  { seconds: 0, label: "durations.never" },
  { seconds: 900, label: "durations.every15min" },
  { seconds: 3600, label: "durations.everyHour" },
  { seconds: 6 * 3600, label: "durations.every6h" },
  { seconds: 12 * 3600, label: "durations.every12h" },
  { seconds: 86_400, label: "durations.everyDay" },
  { seconds: 7 * 86_400, label: "durations.everyWeek" },
] as const;

/** Choices of delay before a missing file is forgotten (seconds). */
export const missingGraces = [3600, 86_400, 3 * 86_400, 7 * 86_400, 30 * 86_400, 90 * 86_400] as const;

/** "1 hour", "3 days": a delay chosen among missingGraces. */
export function graceLabel(seconds: number): string {
  return seconds < 86_400
    ? i18n.t("durations.hours", { count: seconds / 3600 })
    : i18n.t("durations.days", { count: seconds / 86_400 });
}

/** A duration set outside the choices: "45 min", "2 h", "5 days". */
export function durationLabel(seconds: number): string {
  if (seconds % 86_400 === 0) return i18n.t("durations.days", { count: seconds / 86_400 });
  if (seconds % 3600 === 0) return i18n.t("durations.hoursShort", { count: seconds / 3600 });
  return i18n.t("durations.minutesShort", { count: Math.round(seconds / 60) });
}

export interface Tag {
  label: string;
  tone?: "admin" | "warn";
}

/** Tags of an account: role, libraries, maximum age, downloads, disabled. */
export function accountTags(s: AccountSummary, libraryNames: ReadonlyMap<string, string>): Tag[] {
  const a = s.account;
  if (!a) return [];
  const tags: Tag[] = [];
  if (a.isAdmin) tags.push({ label: i18n.t("accountTags.admin"), tone: "admin" });
  else if (!a.libraries || a.libraries.all) tags.push({ label: i18n.t("accountTags.allLibraries") });
  else {
    const names = a.libraries.libraryIds.map((id) => libraryNames.get(id)).filter(Boolean);
    tags.push({
      label: names.length ? names.join(", ") : i18n.t("accountTags.noLibrary"),
      tone: names.length ? undefined : "warn",
    });
  }
  const age = a.isAdmin ? "" : ageLabel(a.parental?.maxAge);
  if (age) tags.push({ label: age });
  if (!a.isAdmin && a.parental?.blockUnrated) tags.push({ label: i18n.t("accountTags.unratedHidden") });
  if (a.denyDownloads) tags.push({ label: i18n.t("accountTags.noDownloads"), tone: "warn" });
  if (a.disabled) tags.push({ label: i18n.t("accountTags.disabled"), tone: "warn" });
  return tags;
}

/** How it plays, in plain words: "direct play", "remux", "transcoded · h264_nvenc". */
export function playbackMethod(p: ActivePlayback): { label: string; transcoded: boolean } {
  if (p.method === "transcode") {
    const what = !p.copyVideo
      ? [p.encoder, p.toneMap ? "HDR → SDR" : "", p.gpu ? i18n.t("playbackMethod.gpu") : ""]
      : [i18n.t("playbackMethod.audio")];
    return {
      label: [i18n.t("playbackMethod.transcoded"), ...what].filter(Boolean).join(" · "),
      transcoded: true,
    };
  }
  return {
    label: p.method === "remux" ? i18n.t("playbackMethod.remux") : i18n.t("playbackMethod.direct"),
    transcoded: false,
  };
}

/** Distinct accounts among signed-in devices. */
export function accountCount(devices: readonly Pick<DeviceSession, "accountId">[]): number {
  return new Set(devices.map((d) => d.accountId)).size;
}

/** Sonarr or Radarr, and what it follows. */
export function integrationName(kind: IntegrationKind): { name: string; what: string; port: string } {
  return kind === IntegrationKind.SONARR
    ? { name: "Sonarr", what: i18n.t("arr.series"), port: "8989" }
    : { name: "Radarr", what: i18n.t("arr.movies"), port: "7878" };
}

export interface IntegrationState {
  pill: string;
  tone?: "ok" | "warn";
  checks: { ok: boolean; label: string }[];
}

/** State of an instance: dot and checks (connection, webhook, metadata, folders, NFO). */
export function integrationState(i: Integration): IntegrationState {
  if (!i.url) return { pill: i18n.t("arr.notLinked"), checks: [] };
  if (!i.reachable)
    return {
      pill: i18n.t("arr.unreachable"),
      tone: "warn",
      checks: [{ ok: false, label: serverText(i.errorText) || i.error || i18n.t("arr.noResponse") }],
    };
  const { what } = integrationName(i.kind);
  const missing = i.missingOptions.length;
  return {
    pill: i18n.t("arr.connected"),
    tone: "ok",
    checks: [
      {
        ok: i.webhook,
        label: i.webhook ? i18n.t("arr.webhookOk") : i18n.t("arr.webhookMissing"),
      },
      {
        ok: i.kodiMetadata,
        label: i.kodiMetadata
          ? i18n.t("arr.kodiOk")
          : missing
            ? i18n.t("arr.kodiMissing", { count: missing, options: i.missingOptions.join(", ") })
            : i18n.t("arr.kodiOff"),
      },
      {
        ok: i.unmapped === 0,
        label: i.unmapped
          ? i18n.t("arr.unmapped", { count: i.unmapped, what, total: i.folders })
          : i18n.t("arr.allMapped", { what }),
      },
      {
        ok: i.withoutNfo === 0,
        label: i.withoutNfo
          ? i18n.t("arr.withoutNfo", {
              count: i.withoutNfo,
              titles: `${i.withoutNfoTitles.join(", ")}${i.withoutNfo > i.withoutNfoTitles.length ? "..." : ""}`,
            })
          : i18n.t("arr.allNfo", { what }),
      },
    ],
  };
}

/**
 * Target of a Jellyfin user in a select: "skip", "new-account", "new-profile:<account>",
 * "profile:<profile>".
 */
export function importTargetValue(t: JellyfinTarget | undefined): string {
  switch (t?.kind) {
    case JellyfinTargetKind.NEW_ACCOUNT:
      return "new-account";
    case JellyfinTargetKind.NEW_PROFILE:
      return `new-profile:${t.accountId}`;
    case JellyfinTargetKind.PROFILE:
      return `profile:${t.profileId}`;
    default:
      return "skip";
  }
}

/** Target from the value of a select (importTargetValue). */
export function importTarget(value: string): JellyfinTarget {
  const [kind, id = ""] = value.split(":");
  switch (kind) {
    case "new-account":
      return create(JellyfinTargetSchema, { kind: JellyfinTargetKind.NEW_ACCOUNT });
    case "new-profile":
      return create(JellyfinTargetSchema, { kind: JellyfinTargetKind.NEW_PROFILE, accountId: id });
    case "profile":
      return create(JellyfinTargetSchema, { kind: JellyfinTargetKind.PROFILE, profileId: id });
    default:
      return create(JellyfinTargetSchema, { kind: JellyfinTargetKind.SKIP });
  }
}

/** "96 %": the share of a user's data found in Laterna. */
export function matchedShare(matched: number, total: number): string {
  return total > 0 ? `${Math.round((matched / total) * 100)} %` : "—";
}
