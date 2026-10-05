import { seconds } from "../../api/media";
import { type Image, type MediaFile, StreamKind } from "../../gen/laterna/v1/catalog_pb";
import {
  type Download,
  DownloadMethod,
  DownloadQuality,
  DownloadState,
} from "../../gen/laterna/v1/download_pb";
import type { Font, SubtitleTrack } from "../../gen/laterna/v1/playback_pb";
import i18n from "../../i18n";
import type { Universe } from "../../theme/contract";
import { codecName, episodeCode, fileSize, languageName, resolutionLabel } from "../catalog/format";

/** Qualities offered (server contract): for video, and for music (translation keys). */
export const qualities = [
  {
    value: DownloadQuality.ORIGINAL,
    label: "downloads.quality.original",
    video: "downloads.quality.originalVideo",
    music: "downloads.quality.originalMusic",
  },
  {
    value: DownloadQuality.HIGH,
    label: "downloads.quality.high",
    video: "downloads.quality.highVideo",
    music: "downloads.quality.highMusic",
  },
  {
    value: DownloadQuality.MEDIUM,
    label: "downloads.quality.medium",
    video: "downloads.quality.mediumVideo",
    music: "downloads.quality.mediumMusic",
  },
  {
    value: DownloadQuality.LOW,
    label: "downloads.quality.low",
    video: "downloads.quality.lowVideo",
    music: "downloads.quality.lowMusic",
  },
] as const;

export function qualityLabel(q: DownloadQuality): string {
  return i18n.t(qualities.find((x) => x.value === q)?.label ?? "downloads.quality.original");
}

function methodLabel(m: DownloadMethod): string {
  switch (m) {
    case DownloadMethod.ORIGINAL:
      return i18n.t("downloads.method.original");
    case DownloadMethod.REMUX:
      return i18n.t("downloads.method.remux");
    case DownloadMethod.TRANSCODE:
      return i18n.t("downloads.method.transcode");
    case DownloadMethod.CONVERTED:
      return i18n.t("downloads.method.converted");
    default:
      return "";
  }
}

/** What is downloaded: identifier, title, secondary line, universe and image shape. */
export function downloadItem(d: Download): {
  id: string;
  title: string;
  context: string;
  universe: Universe;
  images: Image[];
  ratio: number;
} {
  const item = d.item;
  switch (item.case) {
    case "movie":
      return {
        id: item.value.id,
        title: item.value.title,
        context: [i18n.t("catalog.movie"), item.value.year || ""].filter(Boolean).join(" · "),
        universe: "movies",
        images: item.value.images,
        ratio: 2 / 3,
      };
    case "episode": {
      const e = item.value;
      return {
        id: e.id,
        title: e.title || i18n.t("catalog.episodeNumber", { n: e.number }),
        context: [e.seriesTitle, episodeCode(e, true)].filter(Boolean).join(" · "),
        universe: "series",
        images: e.images,
        ratio: 16 / 9,
      };
    }
    case "track":
      return {
        id: item.value.id,
        title: item.value.title,
        context: [item.value.artists || item.value.artistName, item.value.albumTitle]
          .filter(Boolean)
          .join(" · "),
        universe: "music",
        images: item.value.images,
        ratio: 1,
      };
    default:
      return { id: "", title: d.fileName, context: "", universe: "movies", images: [], ratio: 1 };
  }
}

/** "Waiting", "Preparing 42 %", "Ready", "Failed". */
export function stateLabel(d: Download): string {
  switch (d.state) {
    case DownloadState.QUEUED:
      return i18n.t("downloads.state.queued");
    case DownloadState.PREPARING:
      return i18n.t("downloads.state.preparing", { n: Math.floor(d.progress * 100) });
    case DownloadState.READY:
      return i18n.t("downloads.state.ready");
    case DownloadState.FAILED:
      return i18n.t("downloads.state.failed");
    default:
      return "";
  }
}

/** "High · 1.2 GB · transcoded · 1 h 32 min"; expected size (≈) until the file is ready. */
export function downloadLine(d: Download): string {
  const ready = d.state === DownloadState.READY;
  const bytes = ready && d.size > 0n ? d.size : d.estimatedSize;
  const size = bytes > 0n ? `${ready ? "" : "≈ "}${fileSize(bytes)}` : "";
  const length = seconds(d.duration);
  const minutes = Math.round(length / 60);
  const duration =
    length <= 0
      ? ""
      : minutes >= 60
        ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`
        : minutes > 0
          ? `${minutes} min`
          : `${Math.round(length)} s`;
  return [qualityLabel(d.quality), size, methodLabel(d.method), duration].filter(Boolean).join(" · ");
}

/** Name suggested for a subtitle: the file's, the language, the format ("Movie.fre.ass"). */
export function subtitleFileName(fileName: string, language: string, index: number, format: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return `${base}.${language || i18n.t("downloads.trackFile", { n: index })}.${format}`;
}

/** "French · forced · vtt": enough to tell two tracks of the same language apart. */
export function subtitleLabel(st: SubtitleTrack, format: string): string {
  const language = languageName(st.language);
  const t = i18n.t;
  return [
    language || st.title || t("downloads.track", { n: st.index + 1 }),
    st.title && language && st.title !== language ? st.title : "",
    st.forced ? t("player.forced") : "",
    st.hearingImpaired ? t("player.hearingImpaired") : "",
    st.external ? t("player.external") : "",
    format,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Director's Cut · 1080p H.264 · MKV · 8.2 GB": what sets a version apart from the others. */
export function versionLabel(f: MediaFile): string {
  const video = f.streams.find((s) => s.kind === StreamKind.VIDEO);
  return [
    f.version,
    f.part > 0 ? i18n.t("catalog.part", { n: f.part }) : "",
    video
      ? [resolutionLabel(video.width, video.height), codecName(video.codec)].filter(Boolean).join(" ")
      : "",
    f.container.toUpperCase(),
    f.size > 0n ? fileSize(f.size) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * File name for a font attached to ASS subtitles: the name they use for it, with the extension of
 * the served file ("fredoka light.ttf"). No authentication.
 */
export function fontFileName(f: Font): string {
  const ext = /\.[a-z0-9]+$/i.exec(f.url)?.[0] ?? "";
  return `${f.names[0] || i18n.t("downloads.fontFile")}${ext}`;
}
