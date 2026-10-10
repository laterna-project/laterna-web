import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { UpcomingKind, UpcomingReleaseSchema } from "../../gen/laterna/v1/home_pb";
import { releaseDate, upcomingKey, upcomingLines, upcomingUniverse, whenLabel } from "./upcoming";

// Friday, 13 March 2026, 10:00 on the device.
const now = new Date(2026, 2, 13, 10, 0);
const at = (date: Date, allDay = false) =>
  create(UpcomingReleaseSchema, { releaseTime: timestampFromDate(date), allDay });
/** A day as the server sends it for a movie or an album: midnight UTC. */
const day = (y: number, m: number, d: number) => at(new Date(Date.UTC(y, m, d)), true);

describe("whenLabel", () => {
  it("says when an episode airs", () => {
    expect(whenLabel(at(new Date(2026, 2, 13, 16, 30)), now)).toBe("Today, 4:30 PM");
    expect(whenLabel(at(new Date(2026, 2, 14, 9, 5)), now)).toBe("Tomorrow, 9:05 AM");
    expect(whenLabel(at(new Date(2026, 2, 17, 21, 0)), now)).toBe("Tuesday, 9:00 PM");
    expect(whenLabel(at(new Date(2026, 2, 24, 21, 0)), now)).toBe("Mar 24, 9:00 PM");
  });

  it("says a release that is past and not there yet is on its way", () => {
    expect(whenLabel(at(new Date(2026, 2, 13, 9, 59)), now)).toBe("On its way");
    expect(whenLabel(at(new Date(2026, 2, 12, 23, 0)), now)).toBe("On its way");
    expect(whenLabel(day(2026, 2, 12), now)).toBe("On its way");
  });

  it("writes a day without a time alone, and keeps it for the whole day", () => {
    expect(whenLabel(day(2026, 2, 13), now)).toBe("Today");
    expect(whenLabel(day(2026, 2, 13), new Date(2026, 2, 13, 23, 59))).toBe("Today");
    expect(whenLabel(day(2026, 2, 14), now)).toBe("Tomorrow");
    expect(whenLabel(day(2026, 2, 19), now)).toBe("Thursday");
    expect(whenLabel(day(2026, 2, 20), now)).toBe("Mar 20");
  });

  it("says nothing without a date", () => {
    expect(whenLabel(create(UpcomingReleaseSchema, {}), now)).toBe("");
  });
});

describe("releaseDate", () => {
  it("reads a day in UTC, whatever the time zone of the device", () => {
    const d = releaseDate(day(2026, 2, 20));
    expect([d?.getFullYear(), d?.getMonth(), d?.getDate(), d?.getHours()]).toEqual([2026, 2, 20, 0]);
  });

  it("keeps the moment an episode airs", () => {
    const airs = new Date(2026, 2, 13, 16, 30);
    expect(releaseDate(at(airs))?.getTime()).toBe(airs.getTime());
  });
});

describe("upcomingLines", () => {
  const release = (fields: Parameters<typeof create<typeof UpcomingReleaseSchema>>[1]) =>
    create(UpcomingReleaseSchema, fields);

  it("names the series, then the episode", () => {
    const e = release({
      kind: UpcomingKind.EPISODE,
      parentTitle: "Frieren",
      title: "The Journey's End",
      seasonNumber: 2,
      episodeNumber: 5,
    });
    expect(upcomingLines(e)).toEqual({ title: "Frieren", meta: "S2 · E5 · The Journey's End" });
    expect(upcomingLines(release({ ...e, title: "" })).meta).toBe("S2 · E5");
    expect(upcomingUniverse(e.kind)).toBe("series");
  });

  it("names the artist, then the album", () => {
    const a = release({ kind: UpcomingKind.ALBUM, parentTitle: "Daft Punk", title: "Discovery" });
    expect(upcomingLines(a)).toEqual({ title: "Daft Punk", meta: "Discovery" });
    expect(upcomingUniverse(a.kind)).toBe("music");
  });

  it("names a movie", () => {
    const m = release({ kind: UpcomingKind.MOVIE, title: "Suzume" });
    expect(upcomingLines(m)).toEqual({ title: "Suzume", meta: "Movie" });
    expect(upcomingUniverse(m.kind)).toBe("movies");
  });

  it("tells releases apart", () => {
    const episode = (n: number) =>
      release({ kind: UpcomingKind.EPISODE, parentTitle: "Frieren", seasonNumber: 2, episodeNumber: n });
    expect(upcomingKey(episode(5))).not.toBe(upcomingKey(episode(6)));
  });
});
