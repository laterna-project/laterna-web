import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { MediaStreamSchema, StreamKind } from "../../gen/laterna/v1/catalog_pb";
import {
  channelsLabel,
  fileSize,
  languageName,
  longDate,
  relativeDay,
  relativeTime,
  resolutionLabel,
  streamLabel,
} from "./format";

describe("catalog format", () => {
  it.each([
    ["fre", "French"],
    ["fra", "French"],
    ["jpn", "Japanese"],
    ["ger", "German"],
    ["eng", "English"],
    ["und", ""],
    ["", ""],
  ])("language %s -> %s", (code, name) => expect(languageName(code)).toBe(name));

  it.each([
    [3840, 2160, "4K"],
    [1920, 800, "1080p"],
    [1280, 534, "720p"],
    [720, 480, "480p"],
  ])("resolution %dx%d -> %s", (w, h, label) => expect(resolutionLabel(w, h)).toBe(label));

  it("describes the tracks", () => {
    expect(channelsLabel(6)).toBe("5.1");
    expect(
      streamLabel(
        create(MediaStreamSchema, { kind: StreamKind.AUDIO, codec: "ac3", language: "fre", channels: 6 }),
      ),
    ).toBe("French · Dolby Digital 5.1");
    expect(
      streamLabel(
        create(MediaStreamSchema, {
          kind: StreamKind.SUBTITLE,
          codec: "subrip",
          language: "eng",
          forced: true,
        }),
      ),
    ).toBe("English · SRT · forced");
    expect(
      streamLabel(
        create(MediaStreamSchema, {
          kind: StreamKind.SUBTITLE,
          codec: "ass",
          language: "fre",
          title: "French (styled)",
        }),
      ),
    ).toBe("French (styled) · ASS");
  });

  it("does not repeat the language when the track title gives it in its own language", () => {
    expect(
      streamLabel(
        create(MediaStreamSchema, {
          kind: StreamKind.SUBTITLE,
          codec: "subrip",
          language: "eng",
          title: "English",
        }),
      ),
    ).toBe("English · SRT");
    expect(
      streamLabel(
        create(MediaStreamSchema, {
          kind: StreamKind.SUBTITLE,
          codec: "subrip",
          language: "jpn",
          title: "日本語",
        }),
      ),
    ).toBe("Japanese · SRT");
  });

  it("formats sizes and dates", () => {
    // Some languages separate the number from the unit with a narrow no-break space.
    expect(fileSize(1_234_000_000n).replace(/\s/g, " ")).toBe("1.2 GB");
    expect(fileSize(650_000_000).replace(/\s/g, " ")).toBe("650 MB");
    expect(longDate("2026-09-14")).toBe("September 14, 2026");
  });
});

describe("dates", () => {
  it("relative dates", () => {
    const now = new Date(2026, 9, 10, 12);
    expect(relativeDay(new Date(2026, 9, 10, 8), now)).toBe("today");
    expect(relativeDay(new Date(2026, 9, 9, 23), now)).toBe("yesterday");
    expect(relativeDay(new Date(2026, 9, 7), now)).toBe("3 days ago");
    expect(relativeDay(new Date(2026, 8, 25), now)).toBe("2 weeks ago");
    expect(relativeDay(new Date(2025, 2, 4), now)).toBe("on March 4, 2025");
  });

  it("relative times", () => {
    const now = new Date(2026, 9, 10, 12);
    expect(relativeTime(new Date(2026, 9, 10, 11, 59, 40), now)).toBe("just now");
    expect(relativeTime(new Date(2026, 9, 10, 11, 48), now)).toBe("12 min ago");
    expect(relativeTime(new Date(2026, 9, 10, 9), now)).toBe("3 h ago");
    expect(relativeTime(new Date(2026, 9, 9, 23), now)).toBe("yesterday");
  });
});
