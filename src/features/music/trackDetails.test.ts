import { create } from "@bufbuild/protobuf";
import { DurationSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  MediaFileSchema,
  MediaStreamSchema,
  ReplayGainSchema,
  StreamKind,
} from "../../gen/laterna/v1/catalog_pb";
import { replayGainLine, trackFileRows } from "./trackDetails";

describe("track information", () => {
  it("describes the file", () => {
    const audio = create(MediaStreamSchema, {
      kind: StreamKind.AUDIO,
      codec: "flac",
      sampleRate: 44_100,
      bitDepth: 16,
      channels: 2,
      bitrate: 1_411_200n,
    });
    const file = create(MediaFileSchema, {
      container: "flac",
      size: 33_500_000n,
      duration: create(DurationSchema, { seconds: 193n }),
      streams: [audio],
    });
    expect(trackFileRows(file).map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Format: FLAC",
      "Sampling: 44.1 kHz · 16 bits",
      "Channels: Stereo",
      "Bitrate: 1,411 kbit/s",
      "Size: 33.5 MB",
      "Duration: 3:13",
    ]);
  });

  it("sums up ReplayGain", () => {
    expect(
      replayGainLine(create(ReplayGainSchema, { trackGain: -6.21, trackPeak: 0.981, albumGain: -7.1 })),
    ).toBe("track −6.2 dB (peak 0.98) · album −7.1 dB");
    expect(replayGainLine(undefined)).toBe("");
  });
});
