// Player logic without a browser: scrubbing thumbnails, chapters, segments to skip, subtitles, next
// episode, explanation of the playback method. Tested in logic.test.ts.
import type { Duration } from "@bufbuild/protobuf/wkt";
import { serverText } from "../api/text";
import {
  type Chapter,
  type Episode,
  type MediaFile,
  type MediaSegment,
  MediaSegmentKind,
  StreamKind,
  type Trickplay,
} from "../gen/laterna/v1/catalog_pb";
import {
  PlaybackMethod,
  type StartPlaybackResponse,
  type SubtitleTrack,
} from "../gen/laterna/v1/playback_pb";
import i18n from "../i18n";

const sec = (d: Duration | undefined) => (d ? Number(d.seconds) + d.nanos / 1e9 : 0);

/** Scrubbing thumbnail of a position: the sheet, and where the thumbnail sits in it. */
export function trickplayTile(
  t: Trickplay,
  position: number,
): { sheet: string; x: number; y: number; width: number; height: number } | null {
  const interval = sec(t.interval);
  if (interval <= 0 || t.count <= 0 || t.columns <= 0 || t.rows <= 0) return null;
  const n = Math.min(t.count - 1, Math.max(0, Math.floor(position / interval)));
  const perSheet = t.columns * t.rows;
  const sheet = t.sheets[Math.floor(n / perSheet)];
  if (!sheet) return null;
  return {
    sheet,
    x: (n % t.columns) * t.width,
    y: (Math.floor(n / t.columns) % t.rows) * t.height,
    width: t.width,
    height: t.height,
  };
}

export interface ChapterSpan {
  title: string;
  start: number;
  end: number;
}

/** Chapters as contiguous pieces of the bar; a single one, untitled, if the file has none. */
export function chapterSpans(chapters: readonly Chapter[], duration: number): ChapterSpan[] {
  const list = chapters
    .map((c) => ({ title: c.title, start: sec(c.start), end: sec(c.end) }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
  if (list.length === 0) return [{ title: "", start: 0, end: duration }];
  return list;
}

export function chapterAt(list: readonly ChapterSpan[], position: number): ChapterSpan | undefined {
  return list.find((s) => position >= s.start && position < s.end) ?? list.at(-1);
}

/**
 * Segment a player can offer to skip (server: docs/design/intro-detection.md): opening or end
 * credits, recap, preview, found from a named chapter or from the audio of neighboring episodes.
 */
export interface Passage {
  kind: MediaSegmentKind;
  start: number;
  end: number;
}

export function passages(list: readonly MediaSegment[]): Passage[] {
  return list
    .map((s) => ({ kind: s.kind, start: sec(s.start), end: sec(s.end) }))
    .filter((s) => s.kind !== MediaSegmentKind.UNSPECIFIED && s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * Segment in progress at this position. Its last second is no longer part of it: skipping the intro
 * leads to its end, where the button must not show again.
 */
export function passageAt(list: readonly Passage[], position: number): Passage | undefined {
  return list.find((s) => position >= s.start && position < s.end - 1);
}

/** Name of a segment ("Intro", "Credits"), for the bar and announcements. */
export function passageName(kind: MediaSegmentKind): string {
  switch (kind) {
    case MediaSegmentKind.INTRO:
      return i18n.t("player.passage.intro");
    case MediaSegmentKind.CREDITS:
      return i18n.t("player.passage.credits");
    case MediaSegmentKind.RECAP:
      return i18n.t("player.passage.recap");
    case MediaSegmentKind.PREVIEW:
      return i18n.t("player.passage.preview");
    default:
      return "";
  }
}

/** Button that skips a segment; the end credits offer what comes next instead (empty). */
export function skipLabel(kind: MediaSegmentKind): string {
  switch (kind) {
    case MediaSegmentKind.INTRO:
      return i18n.t("player.skip.intro");
    case MediaSegmentKind.RECAP:
      return i18n.t("player.skip.recap");
    case MediaSegmentKind.PREVIEW:
      return i18n.t("player.skip.preview");
    default:
      return "";
  }
}

/** Announcement of a segment skipped automatically: "Intro skipped.". */
export function skippedMessage(kind: MediaSegmentKind): string {
  switch (kind) {
    case MediaSegmentKind.INTRO:
      return i18n.t("player.skipped.intro");
    case MediaSegmentKind.CREDITS:
      return i18n.t("player.skipped.credits");
    case MediaSegmentKind.RECAP:
      return i18n.t("player.skipped.recap");
    case MediaSegmentKind.PREVIEW:
      return i18n.t("player.skipped.preview");
    default:
      return "";
  }
}

/** Segments skipped automatically when asked: those at the start of an episode. */
export function autoSkippable(kind: MediaSegmentKind): boolean {
  return kind === MediaSegmentKind.INTRO || kind === MediaSegmentKind.RECAP;
}

/** How to show a subtitle: by the browser (ASS, WebVTT) or burned in by the server. */
export type SubtitleMode = { kind: "ass"; url: string } | { kind: "vtt"; url: string } | { kind: "burn" };

export function subtitleMode(track: SubtitleTrack, formats: readonly string[]): SubtitleMode {
  const file = (f: string) => (formats.includes(f) ? track.files.find((x) => x.format === f) : undefined);
  const ass = file("ass");
  if (ass) return { kind: "ass", url: ass.url };
  const vtt = file("vtt");
  if (vtt) return { kind: "vtt", url: vtt.url };
  return { kind: "burn" };
}

/** Episode that follows in the series order (the server lists in order), if there is one. */
export function nextEpisode(episodes: readonly Episode[], currentId: string): Episode | undefined {
  const i = episodes.findIndex((e) => e.id === currentId);
  return i >= 0 ? episodes[i + 1] : undefined;
}

/** Episode to play from a series page: the one in progress, otherwise the first not watched. */
export function episodeToPlay(episodes: readonly Episode[]): Episode | undefined {
  const regular = episodes.filter((e) => e.seasonNumber > 0);
  const pool = regular.length > 0 ? regular : episodes;
  return (
    pool.find((e) => !e.userData?.played && sec(e.userData?.position) > 0) ??
    pool.find((e) => !e.userData?.played) ??
    pool[0]
  );
}

/** What the server does for this playback, in plain words. */
export function methodSummary(s: StartPlaybackResponse): { title: string; detail: string } {
  // The reasons in the interface language (reason_texts), otherwise as the server writes them.
  const reasons = sentences(s.reasonTexts.length ? s.reasonTexts.map(serverText) : s.reasons);
  switch (s.method) {
    case PlaybackMethod.DIRECT:
      return { title: i18n.t("player.method.direct"), detail: i18n.t("player.method.directDetail") };
    case PlaybackMethod.HLS_REMUX:
      return {
        title: i18n.t("player.method.remux"),
        detail: reasons || i18n.t("player.method.remuxDetail"),
      };
    case PlaybackMethod.HLS_TRANSCODE: {
      const video = !s.videoEncoder
        ? i18n.t("player.method.video")
        : i18n.t(
            s.gpu
              ? "player.method.videoGpu"
              : s.decoder
                ? "player.method.videoDecoder"
                : "player.method.videoWith",
            { encoder: s.videoEncoder },
          );
      const what = [
        s.videoTranscoded && video,
        s.toneMapping && i18n.t("player.method.toneMapping", { method: s.toneMapping }),
        s.audioTranscoded && i18n.t("player.method.audio"),
      ]
        .filter(Boolean)
        .join(", ");
      return {
        title: i18n.t("player.method.transcode"),
        detail: [sentences([what]), reasons].filter(Boolean).join(" "),
      };
    }
    case PlaybackMethod.CONVERTED:
      return { title: i18n.t("player.method.converted"), detail: reasons };
    default:
      return { title: "", detail: reasons };
  }
}

/** Sentence fragments from the server ("mkv container not played directly") as sentences. */
function sentences(parts: readonly string[]): string {
  return parts
    .filter(Boolean)
    .map((p) => `${p.charAt(0).toUpperCase()}${p.slice(1)}.`)
    .join(" ");
}

/** Audio track the server picks without instructions: the first marked as default, otherwise the first. */
export function defaultAudioIndex(file: MediaFile | undefined): number | undefined {
  const audio = (file?.streams ?? []).filter((x) => x.kind === StreamKind.AUDIO);
  return (audio.find((x) => x.default) ?? audio[0])?.index;
}
