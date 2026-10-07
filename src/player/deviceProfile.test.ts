// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectDeviceProfile, nativeHls } from "./deviceProfile";

afterEach(() => vi.restoreAllMocks());

describe("device profile", () => {
  // jsdom has no Media Source, like an iPhone: the video element says what it plays.
  it("asks the video element without Media Source (iPhone)", () => {
    const iphone: Record<string, CanPlayTypeResult> = {
      "application/vnd.apple.mpegurl": "maybe",
      'video/mp4; codecs="avc1.640028"': "probably",
      'video/mp4; codecs="hvc1.1.6.L120.90"': "probably",
      'video/mp4; codecs="hvc1.2.4.L120.90"': "probably",
      'audio/mp4; codecs="mp4a.40.2"': "probably",
      'audio/mp4; codecs="ec-3"': "probably",
      "video/mp4": "maybe",
      "audio/mp4": "maybe",
    };
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation((type) => iphone[type] ?? "");
    expect(nativeHls()).toBe(true);
    const profile = detectDeviceProfile();
    expect(profile.hls).toBe(true);
    expect(profile.video.map((v) => [v.codec, v.maxBitDepth])).toEqual([
      ["h264", 8],
      ["hevc", 10],
    ]);
    expect(profile.audioCodecs).toEqual(["aac", "eac3"]);
    expect(profile.containers).toEqual(["mp4", "m4a"]);
  });

  it("plays nothing natively where the browser does not play HLS", () => {
    expect(nativeHls()).toBe(false);
    expect(detectDeviceProfile().hls).toBe(false);
  });
});
