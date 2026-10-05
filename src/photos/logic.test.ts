import { create } from "@bufbuild/protobuf";
import { DurationSchema, TimestampSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { PhotoSchema, PhotoSummarySchema } from "../gen/laterna/v1/catalog_pb";
import { PhotoMonthSchema } from "../gen/laterna/v1/photo_pb";
import {
  coordinates,
  dayLabel,
  exifLines,
  groupByDay,
  justify,
  spanLabel,
  timeLabel,
  yearsOf,
} from "./logic";

const at = (iso: string, offsetHours?: number) =>
  create(PhotoSummarySchema, {
    id: iso,
    takenAt: create(TimestampSchema, { seconds: BigInt(Date.parse(iso) / 1000) }),
    utcOffset:
      offsetHours === undefined ? undefined : create(DurationSchema, { seconds: BigInt(offsetHours * 3600) }),
  });

describe("shooting time", () => {
  it("reads the camera's time when its offset is known", () => {
    // 15:42 UTC taken at +02:00: the camera showed 17:42.
    const p = at("2026-09-14T15:42:00Z", 2);
    expect(timeLabel(p)).toBe("5:42 PM");
    expect(dayLabel(p)).toBe("Monday, September 14, 2026");
  });

  it("changes day with the offset", () => {
    expect(dayLabel(at("2026-09-14T23:30:00Z", 2))).toBe("Tuesday, September 15, 2026");
  });

  it("groups consecutive photos of the same day", () => {
    const groups = groupByDay([
      at("2026-09-14T15:00:00Z", 0),
      at("2026-09-14T09:00:00Z", 0),
      at("2026-08-23T12:00:00Z", 0),
    ]);
    expect(groups.map((g) => g.photos.length)).toEqual([2, 1]);
    expect(groups[1]?.label).toBe("Sunday, August 23, 2026");
  });
});

describe("justified rows", () => {
  it("fills the width, the last row keeps the target height", () => {
    const rows = justify([1.5, 1.5, 1.5, 1, 1], 1000, 200, 10);
    // 3 × 1.5 × 200 + 2 × 10 = 920 < 1000; with the 4th: 1130 ≥ 1000.
    expect(rows[0]).toMatchObject({ start: 0, end: 4 });
    expect(rows[0]?.height).toBeCloseTo((1000 - 30) / 5.5, 5);
    expect(rows[1]).toEqual({ start: 4, end: 5, height: 200 });
  });

  it("a very wide photo holds alone on its row", () => {
    expect(justify([8, 1], 800, 200, 10)[0]).toMatchObject({ start: 0, end: 1, height: 100 });
  });
});

describe("years and details", () => {
  const months = [2026, 2025, 2025, 2012].map((year, i) =>
    create(PhotoMonthSchema, { year, month: i + 1, count: 1 }),
  );

  it("years, most recent first", () => {
    expect(yearsOf(months)).toEqual([2026, 2025, 2012]);
    expect(spanLabel(months, new Date(2026, 5, 1))).toBe("from 2012 to today");
    expect(spanLabel(months, new Date(2030, 5, 1))).toBe("from 2012 to 2026");
  });

  it("EXIF details in plain words", () => {
    const p = create(PhotoSchema, {
      summary: create(PhotoSummarySchema, { width: 6000, height: 4000 }),
      cameraMake: "FUJIFILM",
      cameraModel: "FUJIFILM X-T4",
      fNumber: 1.8,
      exposureTime: "1/250",
      iso: 400,
      focalLength: 35,
    });
    expect(exifLines(p)).toEqual([
      ["Camera", "FUJIFILM X-T4"],
      ["Aperture", "f/1.8"],
      ["Shutter speed", "1/250 s"],
      ["ISO", "400"],
      ["Focal length", "35 mm"],
      ["Dimensions", "6000 × 4000"],
    ]);
  });

  it("does not repeat the camera brand", () => {
    const camera = (cameraMake: string, cameraModel: string) =>
      exifLines(create(PhotoSchema, { cameraMake, cameraModel }))[0]?.[1];
    expect(camera("NIKON CORPORATION", "NIKON D800")).toBe("NIKON D800");
    expect(camera("Canon", "Canon EOS 5D")).toBe("Canon EOS 5D");
    expect(camera("FUJIFILM", "X-T4")).toBe("FUJIFILM X-T4");
  });

  it("coordinates", () => {
    expect(coordinates(49.70751, 0.20312)).toBe("49.7075° N · 0.2031° E");
    expect(coordinates(-33.86, -151.2)).toBe("33.8600° S · 151.2000° W");
  });
});
