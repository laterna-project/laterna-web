import { create } from "@bufbuild/protobuf";
import { DurationSchema, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { StatEntrySchema, StatsSchema, TimeBucketSchema } from "../../gen/laterna/v1/history_pb";
import {
  favorites,
  heatmap,
  hoursLabel,
  hourTicks,
  peakMoment,
  tickLabel,
  timelineBars,
  timeSplit,
  wholeDays,
  yearsWithPlays,
} from "./stats";

const d = (s: number) => create(DurationSchema, { seconds: BigInt(s) });

describe("statistics", () => {
  it.each([
    [0, "0 min"],
    [45 * 60, "45 min"],
    [3600, "1 h"],
    [3 * 3600 + 20 * 60, "3 h 20"],
    [154.4 * 3600, "154 h"],
    [1234 * 3600, "1,234 h"],
  ])("%d s : %s", (s, label) => expect(hoursLabel(s).replace(/\s/g, " ")).toBe(label));

  it("names months and years in the requested time zone", () => {
    const bucket = (iso: string, s: number) =>
      create(TimeBucketSchema, { start: timestampFromDate(new Date(iso)), time: d(s) });
    const months = timelineBars([bucket("2026-01-31T23:00:00Z", 3600)], false, "Europe/Paris");
    expect(months[0]).toMatchObject({ label: "Feb", long: "February 2026", seconds: 3600 });
    expect(timelineBars([bucket("2025-01-01T00:00:00Z", 60)], true, "UTC")[0]?.label).toBe("2025");
  });

  it("ticks the axis in round hours", () => {
    expect(hourTicks(28 * 3600)).toEqual([0, 10, 20, 30]);
    expect(hourTicks(40 * 60)).toEqual([0, 0.25, 0.5, 0.75]);
    expect([0, 0.25, 2.5].map(tickLabel)).toEqual(["0", "15 min", "2.5 h"]);
  });

  it("groups the hours of the week into three-hour slots", () => {
    const byHour = Array.from({ length: 168 }, () => d(0));
    byHour[6 * 24 + 20] = d(7200); // Sunday 20:00
    byHour[6 * 24 + 21] = d(3600); // Sunday 21:00: next slot
    byHour[0] = d(600); // Monday midnight
    const cells = heatmap(byHour);
    expect(cells).toHaveLength(56);
    const sunday18 = cells.find((c) => c.day === 6 && c.slot === 6);
    expect(sunday18).toMatchObject({ seconds: 7200, level: 4 });
    expect(cells.find((c) => c.day === 0 && c.slot === 0)?.level).toBe(1);
    expect(cells.find((c) => c.day === 3 && c.slot === 3)?.level).toBe(0);
    expect(peakMoment(cells)).toBe("mostly on Sunday evenings");
    expect(peakMoment(heatmap([]))).toBe("");
  });

  it("splits the time by kind, without empty kinds", () => {
    const s = create(StatsSchema, { episodesTime: d(3 * 3600), moviesTime: d(3600), musicTime: d(0) });
    expect(timeSplit(s)).toEqual([
      {
        label: "TV shows",
        percent: 75,
        seconds: 10800,
      },
      {
        label: "Movies",
        percent: 25,
        seconds: 3600,
      },
    ]);
  });

  it("picks the top items", () => {
    const e = (name: string, time: number, plays: number) =>
      create(StatEntrySchema, { itemId: name, name, time: d(time), plays });
    const s = create(StatsSchema, {
      topSeries: [e("Caminandes", 7200, 3), e("Pepper", 600, 1), e("Trop", 60, 1)],
      topMovies: [e("Sintel", 2000, 3)],
      topArtists: [e("Kevin MacLeod", 900, 214)],
    });
    expect(favorites(s).map((f) => [f.name, f.detail])).toEqual([
      ["Caminandes", "show · 2 h"],
      ["Pepper", "show · 10 min"],
      ["Sintel", "movie · watched 3 times"],
      ["Kevin MacLeod", "artist · 214 plays"],
    ]);
  });

  it("gives the years with sessions", () => {
    const year = (y: number, s: number) =>
      create(TimeBucketSchema, { start: timestampFromDate(new Date(`${y}-01-01T00:00:00Z`)), time: d(s) });
    const all = create(StatsSchema, { timeline: [year(2024, 60), year(2025, 0), year(2026, 120)] });
    expect(yearsWithPlays(all, "UTC")).toEqual([2026, 2024]);
  });

  it("counts whole days", () => {
    expect(wholeDays(3600)).toBe("");
    expect(wholeDays(13.2 * 86400)).toBe("Thirteen whole days in front of Laterna");
    expect(wholeDays(86400)).toBe("One whole day in front of Laterna");
  });
});
