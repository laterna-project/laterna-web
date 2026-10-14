// Attaching a stream prepared by the server (StartPlayback) to a media element, and showing a
// subtitle on it: shared by the video player and watch parties.
import Hls from "hls.js";
import type JASSUB from "jassub";
import { mediaUrl } from "../api/media";
import {
  PlaybackMethod,
  type StartPlaybackResponse,
  type SubtitleTrack,
} from "../gen/laterna/v1/playback_pb";
import i18n from "../i18n";
import { nativeHls } from "./deviceProfile";
import { subtitleMode } from "./logic";

/**
 * Plays a stream in a media element: directly (whole file, Range requests), or as HLS with hls.js,
 * or by the browser itself where it has no Media Source Extensions (iPhone), which then gets the
 * master playlist, with the subtitles. onLoaded: the start position is in place. Returns the
 * function that detaches it.
 */
export function attachStream(
  media: HTMLMediaElement,
  s: StartPlaybackResponse,
  o: { start: number; autoplay: boolean; onLoaded?: () => void; onFatal: (message: string) => void },
): () => void {
  if (s.method === PlaybackMethod.DIRECT || s.method === PlaybackMethod.CONVERTED || nativeHls()) {
    media.src = mediaUrl(streamUrl(s, nativeHls()));
    media.addEventListener(
      "loadedmetadata",
      () => {
        if (o.start > 0) media.currentTime = o.start;
        o.onLoaded?.();
      },
      { once: true },
    );
    if (o.autoplay) media.play().catch(() => {});
    // The next source replaces this one.
    return () => {};
  }
  const h = new Hls({ startPosition: o.start });
  h.on(Hls.Events.MANIFEST_PARSED, () => {
    o.onLoaded?.();
    if (o.autoplay) media.play().catch(() => {});
  });
  h.on(Hls.Events.ERROR, (_e, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
    else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
    else o.onFatal(i18n.t("player.interrupted", { details: data.details }));
  });
  h.loadSource(mediaUrl(s.url));
  h.attachMedia(media);
  return () => h.destroy();
}

/**
 * Path of the stream a media element plays: the master playlist where the browser plays HLS itself
 * (native), since its subtitles are those of the stream; otherwise the stream (url).
 */
export function streamUrl(s: StartPlaybackResponse, native: boolean): string {
  return (native && s.masterUrl) || s.url;
}

/**
 * Subtitle shown by the browser over a video: ASS with JASSUB (styles and attached fonts), WebVTT
 * with a <track> element, or a text track of the stream where the browser plays HLS itself. A
 * burned-in subtitle has nothing to show here.
 */
export class SubtitleLayer {
  #video: HTMLVideoElement;
  #jassub: JASSUB | null = null;
  #unlisten: (() => void) | null = null;

  constructor(video: HTMLVideoElement) {
    this.#video = video;
  }

  clear(): void {
    void this.#jassub?.destroy();
    this.#jassub = null;
    this.#unlisten?.();
    this.#unlisten = null;
    for (const t of Array.from(this.#video.querySelectorAll("track"))) t.remove();
  }

  /** still: is the playback still this one (JASSUB loads on demand)? */
  async show(
    s: StartPlaybackResponse,
    track: SubtitleTrack | undefined,
    formats: readonly string[],
    still: () => boolean,
  ): Promise<void> {
    this.clear();
    if (nativeHls() && s.masterUrl) {
      this.#pick(s, track);
      return;
    }
    if (!track) return;
    const mode = subtitleMode(track, formats);
    if (mode.kind === "ass") {
      const { default: Renderer } = await import("jassub");
      if (!still()) return;
      this.#jassub = new Renderer({
        video: this.#video,
        subUrl: mediaUrl(mode.url),
        // All the fonts attached to the file: libass picks the right variant.
        fonts: s.fonts.map((f) => mediaUrl(f.url)),
      });
    } else if (mode.kind === "vtt") {
      const t = document.createElement("track");
      t.kind = "subtitles";
      t.src = mediaUrl(mode.url);
      t.srclang = track.language;
      t.default = true;
      this.#video.append(t);
      t.track.mode = "showing";
    }
  }

  /**
   * Shows the text track of the stream that is this subtitle (none: hides them all). The tracks
   * appear once the browser has read the master playlist, and again with each new stream.
   */
  #pick(s: StartPlaybackResponse, track: SubtitleTrack | undefined): void {
    const tracks = this.#video.textTracks;
    const apply = () => {
      const target = renditionTrack(Array.from(tracks), s.subtitles, track);
      for (const t of Array.from(tracks)) {
        if (t.kind === "subtitles" || t.kind === "captions") t.mode = t === target ? "showing" : "disabled";
      }
    };
    apply();
    tracks.addEventListener("addtrack", apply);
    this.#unlisten = () => tracks.removeEventListener("addtrack", apply);
  }
}

/**
 * Text track of the stream for a subtitle: the one labelled with the name of its rendition (the
 * browser labels a track with the NAME of the rendition), or else the one at its place among the
 * renditions when the stream has exactly as many text tracks.
 */
export function renditionTrack<T extends { kind: string; label: string }>(
  tracks: readonly T[],
  subtitles: readonly SubtitleTrack[],
  track: SubtitleTrack | undefined,
): T | undefined {
  if (!track?.rendition) return undefined;
  const texts = tracks.filter((t) => t.kind === "subtitles" || t.kind === "captions");
  const named = texts.find((t) => t.label === track.rendition);
  if (named) return named;
  const renditions = subtitles.filter((x) => x.rendition !== "");
  return texts.length === renditions.length
    ? texts[renditions.findIndex((x) => x.index === track.index)]
    : undefined;
}
