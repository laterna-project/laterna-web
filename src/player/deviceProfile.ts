import { create } from "@bufbuild/protobuf";
import { type DeviceProfile, DeviceProfileSchema, VideoSupportSchema } from "../gen/laterna/v1/playback_pb";

/** Video containers played directly by the <video> element (Chrome also plays Matroska). */
const videoTypes: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska" };
const videoContainers = Object.keys(videoTypes);

/**
 * What THIS browser can play, tested codec by codec (MediaSource.isTypeSupported). From it the
 * server decides, for each playback: direct play, HLS without transcoding, or transcoding.
 */
export function detectDeviceProfile(): DeviceProfile {
  const ms = (type: string) => typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(type);
  const hdr = typeof matchMedia !== "undefined" && matchMedia("(dynamic-range: high)").matches;
  const codecs: Record<string, [string, string?]> = {
    h264: ["avc1.640028"],
    hevc: ["hvc1.1.6.L120.90", "hvc1.2.4.L120.90"],
    vp8: ["vp8"],
    vp9: ["vp09.00.10.08", "vp09.02.10.10"],
    av1: ["av01.0.08M.08", "av01.0.08M.10"],
  };
  const video = Object.entries(codecs)
    .filter(([codec, [eight]]) =>
      codec === "vp8" ? ms(`video/webm; codecs="${eight}"`) : ms(`video/mp4; codecs="${eight}"`),
    )
    .map(([codec, [, ten]]) =>
      create(VideoSupportSchema, {
        codec,
        maxBitDepth: ten && ms(`video/mp4; codecs="${ten}"`) ? 10 : 8,
        hdr,
      }),
    );
  const audio: Record<string, string> = {
    aac: "mp4a.40.2",
    mp3: "mp4a.69",
    opus: "opus",
    flac: "flac",
    ac3: "ac-3",
    eac3: "ec-3",
  };
  const audioCodecs = Object.entries(audio)
    .filter(([, c]) => ms(`audio/mp4; codecs="${c}"`))
    .map(([name]) => name);
  if (ms('audio/webm; codecs="vorbis"')) audioCodecs.push("vorbis");

  const probe = typeof document !== "undefined" ? document.createElement("video") : undefined;
  const containers = Object.entries(videoTypes)
    .filter(([, type]) => video.length > 0 && probe?.canPlayType(type))
    .map(([c]) => c);
  const audioProbe = typeof document !== "undefined" ? document.createElement("audio") : undefined;
  const audioTypes: Record<string, string> = {
    flac: "audio/flac",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
  };
  for (const [c, type] of Object.entries(audioTypes)) if (audioProbe?.canPlayType(type)) containers.push(c);

  return create(DeviceProfileSchema, {
    containers,
    video,
    audioCodecs,
    hls: hlsSupported(),
    // WebVTT by the browser, ASS by JASSUB; image subtitles (PGS) are burned in.
    subtitleFormats: ["vtt", "ass"],
  });
}

/** Does the browser itself pick the audio track of a file played directly (Safari)? */
export function canSwitchAudioTracks(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "audioTracks" in HTMLMediaElement.prototype;
}

/**
 * Same profile, without direct play of the video: the server then goes through an HLS stream, where
 * it puts the requested audio track (a browser without audioTracks would only play the default
 * one).
 */
export function withoutDirectVideo(profile: DeviceProfile): DeviceProfile {
  return create(DeviceProfileSchema, {
    ...profile,
    containers: profile.containers.filter((c) => !videoContainers.includes(c)),
  });
}

/**
 * Can the player read an HLS stream (with hls.js, so with Media Source Extensions)? Same test as
 * Hls.isSupported(), without loading hls.js: the music player, present on every page, also
 * describes the device.
 */
function hlsSupported(): boolean {
  const ms =
    typeof window === "undefined"
      ? undefined
      : ((window as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource ?? window.MediaSource);
  if (!ms || typeof ms.isTypeSupported !== "function") return false;
  return ["avc1.42E01E,mp4a.40.2", "av01.0.01M.08", "vp09.00.50.08"].some((c) =>
    ms.isTypeSupported(`video/mp4; codecs="${c}"`),
  );
}
