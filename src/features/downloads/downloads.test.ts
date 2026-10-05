import { create } from "@bufbuild/protobuf";
import { DurationSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  EpisodeSchema,
  MediaFileSchema,
  MediaStreamSchema,
  StreamKind,
  TrackSchema,
} from "../../gen/laterna/v1/catalog_pb";
import {
  DownloadMethod,
  DownloadQuality,
  DownloadSchema,
  DownloadState,
} from "../../gen/laterna/v1/download_pb";
import { FontSchema, SubtitleTrackSchema } from "../../gen/laterna/v1/playback_pb";
import {
  downloadItem,
  downloadLine,
  fontFileName,
  stateLabel,
  subtitleFileName,
  subtitleLabel,
  versionLabel,
} from "./downloads";

describe("downloads", () => {
  const episode = create(DownloadSchema, {
    id: "d1",
    item: {
      case: "episode",
      value: create(EpisodeSchema, {
        id: "e1",
        seriesTitle: "Popeye",
        seasonNumber: 1,
        number: 3,
        title: "",
      }),
    },
    quality: DownloadQuality.MEDIUM,
    state: DownloadState.PREPARING,
    method: DownloadMethod.TRANSCODE,
    progress: 0.426,
    estimatedSize: 420_000_000n,
    duration: create(DurationSchema, { seconds: 5_520n }),
  });

  it("describes the downloaded item", () => {
    expect(downloadItem(episode)).toMatchObject({
      id: "e1",
      title: "Episode 3",
      context: "Popeye · S1 E3",
      universe: "series",
    });
    const track = create(DownloadSchema, {
      item: {
        case: "track",
        value: create(TrackSchema, {
          id: "t1",
          title: "Gymnopedie No. 1",
          artistName: "Satie",
          albumTitle: "Piano",
        }),
      },
    });
    expect(downloadItem(track)).toMatchObject({ id: "t1", context: "Satie · Piano", ratio: 1 });
  });

  it("formats the state and the secondary line", () => {
    expect(stateLabel(episode)).toBe("Preparing 42%");
    expect(downloadLine(episode)).toBe("Medium · ≈ 420 MB · re-encoded · 1 h 32");
    const ready = create(DownloadSchema, {
      ...episode,
      state: DownloadState.READY,
      method: DownloadMethod.ORIGINAL,
      quality: DownloadQuality.ORIGINAL,
      size: 1_234_000_000n,
      duration: create(DurationSchema, { seconds: 300n }),
    });
    expect(stateLabel(ready)).toBe("Ready");
    expect(downloadLine(ready)).toBe("Original · 1.2 GB · as is · 5 min");
  });

  it("names subtitles after the file", () => {
    expect(subtitleFileName("Popeye - S01E03.mp4", "fre", 0, "ass")).toBe("Popeye - S01E03.fre.ass");
    expect(subtitleFileName("Film.mkv", "", 2, "vtt")).toBe("Film.track2.vtt");
  });

  it("tells two subtitles of the same language apart", () => {
    const track = (extra: object) => create(SubtitleTrackSchema, { index: 3, language: "dut", ...extra });
    expect(subtitleLabel(track({}), "vtt")).toBe("Dutch · vtt");
    expect(subtitleLabel(track({ external: true, forced: true }), "ass")).toBe(
      "Dutch · forced · separate file · ass",
    );
    expect(subtitleLabel(track({ language: "", title: "Commentaires" }), "vtt")).toBe("Commentaires · vtt");
  });

  it("names versions and fonts", () => {
    const video = create(MediaStreamSchema, {
      kind: StreamKind.VIDEO,
      codec: "hevc",
      width: 3840,
      height: 1600,
    });
    const file = create(MediaFileSchema, {
      version: "Director's Cut",
      container: "mkv",
      size: 12_000_000_000n,
      streams: [video],
    });
    expect(versionLabel(file)).toBe("Director's Cut · 4K HEVC · MKV · 12 GB");
    expect(fontFileName(create(FontSchema, { names: ["fredoka light"], url: "/fonts/ab12.ttf" }))).toBe(
      "fredoka light.ttf",
    );
    expect(fontFileName(create(FontSchema, { url: "/fonts/cd34.otf" }))).toBe("font.otf");
  });
});
