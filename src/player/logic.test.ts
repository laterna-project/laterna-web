import { create } from "@bufbuild/protobuf";
import { DurationSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  ChapterSchema,
  EpisodeSchema,
  MediaFileSchema,
  MediaSegmentKind,
  MediaSegmentSchema,
  MediaStreamSchema,
  StreamKind,
  TrickplaySchema,
  UserDataSchema,
} from "../gen/laterna/v1/catalog_pb";
import {
  PlaybackMethod,
  StartPlaybackResponseSchema,
  SubtitleFileSchema,
  SubtitleTrackSchema,
} from "../gen/laterna/v1/playback_pb";
import {
  autoSkippable,
  chapterAt,
  chapterSpans,
  defaultAudioIndex,
  episodeToPlay,
  methodSummary,
  nextEpisode,
  passageAt,
  passageName,
  passages,
  skipLabel,
  subtitleMode,
  trickplayTile,
} from "./logic";

const d = (s: number) => create(DurationSchema, { seconds: BigInt(s) });

describe("scrubbing thumbnails", () => {
  const t = create(TrickplaySchema, {
    interval: d(10),
    width: 320,
    height: 180,
    columns: 10,
    rows: 10,
    count: 150,
    sheets: ["/trickplay/a/k/0.jpg", "/trickplay/a/k/1.jpg"],
  });

  it("places the thumbnail in its sheet", () => {
    expect(trickplayTile(t, 0)).toEqual({
      sheet: "/trickplay/a/k/0.jpg",
      x: 0,
      y: 0,
      width: 320,
      height: 180,
    });
    expect(trickplayTile(t, 125)).toMatchObject({ sheet: "/trickplay/a/k/0.jpg", x: 640, y: 180 });
    expect(trickplayTile(t, 1005)).toMatchObject({ sheet: "/trickplay/a/k/1.jpg", x: 0, y: 0 });
  });

  it("stops at the last thumbnail", () => {
    expect(trickplayTile(t, 99_999)).toMatchObject({ sheet: "/trickplay/a/k/1.jpg", x: 9 * 320, y: 4 * 180 });
  });
});

describe("chapters", () => {
  const list = chapterSpans(
    [
      create(ChapterSchema, { title: "Opening", start: d(0), end: d(90) }),
      create(ChapterSchema, { title: "Part A", start: d(90), end: d(700) }),
      create(ChapterSchema, { title: "Ending", start: d(700), end: d(790) }),
    ],
    790,
  );

  it("finds the chapter of a position", () => {
    expect(chapterAt(list, 45)?.title).toBe("Opening");
    expect(chapterAt(list, 700)?.title).toBe("Ending");
  });

  it("a single piece without chapters", () => {
    expect(chapterSpans([], 120)).toEqual([{ title: "", start: 0, end: 120 }]);
  });
});

describe("segments to skip", () => {
  const list = passages([
    create(MediaSegmentSchema, { kind: MediaSegmentKind.CREDITS, start: d(1300), end: d(1390) }),
    create(MediaSegmentSchema, { kind: MediaSegmentKind.INTRO, start: d(52), end: d(141) }),
    create(MediaSegmentSchema, { kind: MediaSegmentKind.UNSPECIFIED, start: d(0), end: d(10) }),
    create(MediaSegmentSchema, { kind: MediaSegmentKind.RECAP, start: d(20), end: d(20) }),
  ]);

  it("keeps known, non-empty segments, in order", () => {
    expect(list.map((p) => p.kind)).toEqual([MediaSegmentKind.INTRO, MediaSegmentKind.CREDITS]);
  });

  it("finds the current segment, except in its last second", () => {
    expect(passageAt(list, 51)).toBeUndefined();
    expect(passageAt(list, 52)?.kind).toBe(MediaSegmentKind.INTRO);
    expect(passageAt(list, 140.2)).toBeUndefined();
    expect(passageAt(list, 1350)?.kind).toBe(MediaSegmentKind.CREDITS);
  });

  it("names the segments and their button", () => {
    expect(skipLabel(MediaSegmentKind.INTRO)).toBe("Skip intro");
    expect(skipLabel(MediaSegmentKind.CREDITS)).toBe("");
    expect(passageName(MediaSegmentKind.CREDITS)).toBe("Credits");
    expect(autoSkippable(MediaSegmentKind.RECAP)).toBe(true);
    expect(autoSkippable(MediaSegmentKind.PREVIEW)).toBe(false);
  });
});

describe("subtitles", () => {
  const files = [
    create(SubtitleFileSchema, { format: "ass", url: "/s/0.ass" }),
    create(SubtitleFileSchema, { format: "vtt", url: "/s/0.vtt" }),
  ];
  const ass = create(SubtitleTrackSchema, { files });
  const pgs = create(SubtitleTrackSchema, {
    image: true,
    files: [create(SubtitleFileSchema, { format: "sup", url: "/s/1.sup" })],
  });

  it("prefers ASS when the browser shows it", () => {
    expect(subtitleMode(ass, ["vtt", "ass"])).toEqual({ kind: "ass", url: "/s/0.ass" });
    expect(subtitleMode(ass, ["vtt"])).toEqual({ kind: "vtt", url: "/s/0.vtt" });
  });

  it("has the server burn in what the browser cannot show", () => {
    expect(subtitleMode(pgs, ["vtt", "ass"])).toEqual({ kind: "burn" });
  });
});

describe("episodes", () => {
  const ep = (id: string, season: number, played = false, position = 0) =>
    create(EpisodeSchema, {
      id,
      seasonNumber: season,
      userData: create(UserDataSchema, { played, position: position ? d(position) : undefined }),
    });
  const list = [ep("s0", 0), ep("a", 1, true), ep("b", 1, false, 120), ep("c", 1)];

  it("gives the next episode", () => {
    expect(nextEpisode(list, "b")?.id).toBe("c");
    expect(nextEpisode(list, "c")).toBeUndefined();
  });

  it("resumes the episode in progress, otherwise the first unwatched, specials excluded", () => {
    expect(episodeToPlay(list)?.id).toBe("b");
    expect(episodeToPlay([ep("s0", 0), ep("a", 1, true), ep("c", 1)])?.id).toBe("c");
  });
});

describe("playback method", () => {
  it("explains a transcode in sentences", () => {
    const s = create(StartPlaybackResponseSchema, {
      method: PlaybackMethod.HLS_TRANSCODE,
      videoTranscoded: true,
      audioTranscoded: true,
      videoEncoder: "h264_qsv",
      reasons: ["vp8 video not supported by the device", "avi container not played directly"],
    });
    expect(methodSummary(s)).toEqual({
      title: "Re-encoded by the server",
      detail:
        "Picture re-encoded (h264_qsv), sound re-encoded to AAC. Vp8 video not supported by the device. Avi container not played directly.",
    });
  });

  it("says where the picture was decoded", () => {
    const s = (fields: object) =>
      create(StartPlaybackResponseSchema, {
        method: PlaybackMethod.HLS_TRANSCODE,
        videoTranscoded: true,
        videoEncoder: "h264_nvenc",
        ...fields,
      });
    expect(methodSummary(s({ decoder: "cuda" })).detail).toBe(
      "Picture re-encoded (h264_nvenc, decoded by the graphics card).",
    );
    expect(methodSummary(s({ gpu: true })).detail).toBe(
      "Picture re-encoded (h264_nvenc, on the graphics card).",
    );
  });

  it("direct play", () => {
    expect(methodSummary(create(StartPlaybackResponseSchema, { method: PlaybackMethod.DIRECT })).title).toBe(
      "Direct play",
    );
  });
});

describe("default audio track", () => {
  const stream = (index: number, kind: StreamKind, isDefault = false) =>
    create(MediaStreamSchema, { index, kind, default: isDefault });

  it("takes the first marked as default, otherwise the first", () => {
    const file = (...streams: ReturnType<typeof stream>[]) => create(MediaFileSchema, { streams });
    expect(
      defaultAudioIndex(
        file(stream(0, StreamKind.VIDEO), stream(1, StreamKind.AUDIO), stream(2, StreamKind.AUDIO, true)),
      ),
    ).toBe(2);
    expect(
      defaultAudioIndex(
        file(stream(0, StreamKind.VIDEO), stream(1, StreamKind.AUDIO), stream(2, StreamKind.AUDIO)),
      ),
    ).toBe(1);
    expect(defaultAudioIndex(file(stream(0, StreamKind.VIDEO)))).toBeUndefined();
  });
});
