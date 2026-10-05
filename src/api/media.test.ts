import { create } from "@bufbuild/protobuf";
import { DurationSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it, vi } from "vitest";
import { ImageKind, ImageSchema } from "../gen/laterna/v1/catalog_pb";

vi.mock("./transport", () => ({ serverUrl: () => "http://laterna.test" }));

const { formatClock, formatRating, formatRuntime, imageSrcSet, imageUrl, imageWidthFor, pickImage, seconds } =
  await import("./media");

describe("ratings", () => {
  it.each([
    ["FR:-12", "-12"],
    ["FR:TP", "All ages"],
    ["US:PG-13", "PG-13"],
    ["TV-MA", "TV-MA"],
    ["U", "All ages"],
  ])("%s -> %s", (raw, shown) => expect(formatRating(raw)).toBe(shown));
});

const poster = create(ImageSchema, { kind: ImageKind.POSTER, url: "/images/a/b", width: 600, height: 900 });
const backdrop = create(ImageSchema, {
  kind: ImageKind.BACKDROP,
  url: "/images/c/d",
  width: 1280,
  height: 720,
});

describe("images", () => {
  it("asks for a resized version only when it is smaller than the original", () => {
    expect(imageUrl(poster, 320)).toBe("http://laterna.test/images/a/b?w=320");
    expect(imageUrl(poster, 960)).toBe("http://laterna.test/images/a/b");
  });

  it("offers the steps up to the original width", () => {
    expect(imageSrcSet(poster)).toBe(
      [160, 240, 320, 480].map((w) => `http://laterna.test/images/a/b?w=${w} ${w}w`).join(", ") +
        ", http://laterna.test/images/a/b 600w",
    );
  });

  it("picks the first image kind present", () => {
    expect(pickImage([poster, backdrop], ImageKind.THUMB, ImageKind.BACKDROP)).toBe(backdrop);
    expect(pickImage([poster], ImageKind.THUMB)).toBeUndefined();
  });
});

describe("durations", () => {
  it("reads a Duration", () => {
    expect(seconds(create(DurationSchema, { seconds: 90n, nanos: 500_000_000 }))).toBe(90.5);
    expect(seconds(undefined)).toBe(0);
  });

  it.each([
    [9966, "2 h 46 min"],
    [7200, "2 h"],
    [2760, "46 min"],
    [10, "1 min"],
  ])("runtime %d s -> %s", (s, text) => expect(formatRuntime(s)).toBe(text));

  it.each([
    [4325, "1:12:05"],
    [247, "4:07"],
    [0, "0:00"],
  ])("position %d s -> %s", (s, text) => expect(formatClock(s)).toBe(text));
});

describe("image width", () => {
  it("asks for the step that is enough", () => {
    expect(imageWidthFor(600, 1)).toBe(640);
    expect(imageWidthFor(600, 2)).toBe(1280);
    expect(imageWidthFor(3000, 2)).toBe(1920);
  });
});
