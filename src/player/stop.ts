import { postKeepalive } from "../api/keepalive";

/** Closes a playback when the page goes away (tab closed, reload). */
export function stopOnUnload(sessionId: string, position: number): void {
  postKeepalive("/laterna.v1.PlaybackService/StopPlayback", {
    sessionId,
    position: `${position.toFixed(3)}s`,
  });
}
