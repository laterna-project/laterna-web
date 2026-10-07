// Full screen of the video player. A page can fill the screen everywhere except on iPhone, where
// only the system's player can: it takes over with its own controls (subtitles from <track>).

interface SystemPlayer extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
}

/** Can the player go full screen in this browser? */
export function canFullscreen(): boolean {
  return document.fullscreenEnabled || "webkitEnterFullscreen" in HTMLVideoElement.prototype;
}

/**
 * The stage (picture and controls) fills the screen; a wide picture turns a phone or a tablet held
 * upright sideways, as long as it stays full screen.
 */
export function enterFullscreen(stage: HTMLElement, video: HTMLVideoElement): void {
  if (!document.fullscreenEnabled) {
    (video as SystemPlayer).webkitEnterFullscreen?.();
    return;
  }
  void stage
    .requestFullscreen()
    // Leaving full screen frees the orientation again.
    .then(() => {
      if (video.videoWidth > video.videoHeight) return screen.orientation?.lock?.("landscape");
    })
    // Only phones and tablets turn, and not in every browser: elsewhere the picture stays as it is.
    .catch(() => {});
}

export function exitFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
}
