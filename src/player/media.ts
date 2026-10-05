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
import { subtitleMode } from "./logic";

/**
 * Plays a stream in a media element: directly (whole file, Range requests), or as HLS with hls.js.
 * onLoaded: the start position is in place. Returns the function that detaches it.
 */
export function attachStream(
  media: HTMLMediaElement,
  s: StartPlaybackResponse,
  o: { start: number; autoplay: boolean; onLoaded?: () => void; onFatal: (message: string) => void },
): () => void {
  const url = mediaUrl(s.url);
  if (s.method === PlaybackMethod.DIRECT || s.method === PlaybackMethod.CONVERTED) {
    media.src = url;
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
  h.loadSource(url);
  h.attachMedia(media);
  return () => h.destroy();
}

/**
 * Subtitle shown by the browser over a video: ASS with JASSUB (styles and attached fonts), WebVTT
 * with a <track> element. A burned-in subtitle has nothing to show here.
 */
export class SubtitleLayer {
  #video: HTMLVideoElement;
  #jassub: JASSUB | null = null;

  constructor(video: HTMLVideoElement) {
    this.#video = video;
  }

  clear(): void {
    void this.#jassub?.destroy();
    this.#jassub = null;
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
}
