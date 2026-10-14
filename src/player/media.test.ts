// @vitest-environment jsdom
import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlaybackMethod,
  StartPlaybackResponseSchema,
  SubtitleTrackSchema,
} from "../gen/laterna/v1/playback_pb";
import { playerProfile } from "./deviceProfile";
import { renditionTrack, SubtitleLayer, streamUrl } from "./media";

afterEach(() => vi.restoreAllMocks());

// jsdom has no Media Source, like an iPhone: the browser plays HLS itself if the video element
// says it reads it.
const iphone = () =>
  vi
    .spyOn(HTMLMediaElement.prototype, "canPlayType")
    .mockImplementation((type) =>
      type === "application/vnd.apple.mpegurl" || type.startsWith("video/mp4") ? "probably" : "",
    );

const french = create(SubtitleTrackSchema, { index: 0, language: "fre", rendition: "French" });
const pgs = create(SubtitleTrackSchema, { index: 1, language: "fre", image: true });
const english = create(SubtitleTrackSchema, { index: 2, language: "eng", rendition: "English" });
const stream = create(StartPlaybackResponseSchema, {
  method: PlaybackMethod.HLS_REMUX,
  url: "/playback/s/t/main.m3u8",
  masterUrl: "/playback/s/t/master.m3u8",
  subtitles: [french, pgs, english],
});

type Fake = { kind: string; label: string; mode: TextTrackMode };
const text = (label: string, kind = "subtitles"): Fake => ({ kind, label, mode: "disabled" });

/** A video element whose stream brings its text tracks. */
function video() {
  const tracks = Object.assign(new EventTarget(), { length: 0 }) as EventTarget & {
    length: number;
    [i: number]: Fake;
  };
  const add = (t: Fake) => {
    tracks[tracks.length] = t;
    tracks.length++;
    tracks.dispatchEvent(new Event("addtrack"));
  };
  return { element: { textTracks: tracks, querySelectorAll: () => [] } as unknown as HTMLVideoElement, add };
}

describe("subtitles of the stream (iPhone)", () => {
  it("plays the master playlist where the browser plays HLS itself", () => {
    expect(streamUrl(stream, true)).toBe("/playback/s/t/master.m3u8");
    expect(streamUrl(stream, false)).toBe("/playback/s/t/main.m3u8");
    const direct = create(StartPlaybackResponseSchema, {
      method: PlaybackMethod.DIRECT,
      url: "/playback/s/t/direct",
    });
    expect(streamUrl(direct, true)).toBe("/playback/s/t/direct");
  });

  it("finds the text track of a subtitle by the name of its rendition, or else by its place", () => {
    const tracks = [text("Chapters", "chapters"), text("French"), text("English", "captions")];
    expect(renditionTrack(tracks, stream.subtitles, english)).toBe(tracks[2]);
    expect(renditionTrack(tracks, stream.subtitles, pgs)).toBeUndefined();
    expect(renditionTrack(tracks, stream.subtitles, undefined)).toBeUndefined();
    // Labels of their own: the place among the renditions, if the counts agree.
    const unnamed = [text("fr"), text("en")];
    expect(renditionTrack(unnamed, stream.subtitles, english)).toBe(unnamed[1]);
    expect(renditionTrack([text("fr")], stream.subtitles, english)).toBeUndefined();
  });

  it("shows the track chosen once the stream brings it, and hides the others", async () => {
    iphone();
    const v = video();
    const layer = new SubtitleLayer(v.element);
    await layer.show(stream, english, ["vtt"], () => true);
    const fr = text("French");
    const en = text("English");
    v.add(fr);
    v.add(en);
    expect([fr.mode, en.mode]).toEqual(["disabled", "showing"]);
    await layer.show(stream, undefined, ["vtt"], () => true);
    expect([fr.mode, en.mode]).toEqual(["disabled", "disabled"]);
    await layer.show(stream, french, ["vtt"], () => true);
    expect([fr.mode, en.mode]).toEqual(["showing", "disabled"]);
    // Cleared: the next stream's tracks are left alone.
    layer.clear();
    const next = text("French");
    next.mode = "showing";
    v.add(next);
    expect(next.mode).toBe("showing");
  });

  it("asks the server for WebVTT and a stream where the browser plays HLS itself", () => {
    iphone();
    const profile = playerProfile();
    expect(profile.subtitleFormats).toEqual(["vtt"]);
    expect(profile.containers).not.toContain("mp4");
    expect(profile.hls).toBe(true);
  });

  it("keeps ASS and direct play elsewhere", () => {
    expect(playerProfile().subtitleFormats).toEqual(["vtt", "ass"]);
  });
});
