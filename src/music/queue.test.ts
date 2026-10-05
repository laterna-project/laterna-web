import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { ReplayGainSchema, type Track, TrackSchema } from "../gen/laterna/v1/catalog_pb";
import {
  advance,
  append,
  back,
  describeGain,
  gainFactor,
  gainModeFor,
  nextRepeat,
  playNext,
  removeAt,
  startQueue,
  toggleShuffle,
} from "./queue";

const track = (id: string, albumId = "a") => create(TrackSchema, { id, albumId, title: id });
const ids = (tracks: Track[]) => tracks.map((t) => t.id);
const [t1, t2, t3, t4] = ["1", "2", "3", "4"].map((id) => track(id));
const album = [t1, t2, t3] as Track[];

describe("listening queue", () => {
  it("starts at the chosen track", () => {
    const q = startQueue(album, 1);
    expect(q.index).toBe(1);
    expect(ids(q.tracks)).toEqual(["1", "2", "3"]);
  });

  it("continues, then stops at the end of the queue", () => {
    let q = startQueue(album, 1);
    q = advance(q, true).queue;
    expect(q.index).toBe(2);
    expect(advance(q, true).ended).toBe(true);
  });

  it("repeats the queue or the track", () => {
    const all = { ...startQueue(album, 2), repeat: "all" as const };
    expect(advance(all, true).queue.index).toBe(0);
    expect(back({ ...all, index: 0 }).index).toBe(2);
    const one = { ...startQueue(album, 1), repeat: "one" as const };
    expect(advance(one, true).queue.index).toBe(1);
    // "Next" asked for: it moves to the next one anyway.
    expect(advance(one, false).queue.index).toBe(2);
    expect(nextRepeat("off")).toBe("all");
    expect(nextRepeat("one")).toBe("off");
  });

  it("plays next or adds to the end", () => {
    const q = startQueue(album, 0);
    expect(ids(playNext(q, [t4 as Track]).tracks)).toEqual(["1", "4", "2", "3"]);
    expect(ids(append(q, [t4 as Track]).tracks)).toEqual(["1", "2", "3", "4"]);
    expect(ids(append(startQueue([]), [t4 as Track]).tracks)).toEqual(["4"]);
  });

  it("removes a track and keeps the current one", () => {
    const q = startQueue(album, 1);
    expect(removeAt(q, 0)).toMatchObject({ index: 0 });
    expect(ids(removeAt(q, 0).tracks)).toEqual(["2", "3"]);
    // Removing the current track moves to the next one.
    expect(removeAt(q, 1).tracks[removeAt(q, 1).index]?.id).toBe("3");
    expect(removeAt(startQueue([t1 as Track]), 0).index).toBe(-1);
  });

  it("shuffles keeping the current track, then restores the order", () => {
    const q = startQueue([...album, t4 as Track], 1);
    const mixed = toggleShuffle(q, () => 0);
    expect(mixed.tracks[0]?.id).toBe("2");
    expect(mixed.index).toBe(0);
    expect(new Set(ids(mixed.tracks))).toEqual(new Set(["1", "2", "3", "4"]));
    const back = toggleShuffle({ ...mixed, index: 2 });
    expect(ids(back.tracks)).toEqual(["1", "2", "3", "4"]);
    expect(back.tracks[back.index]?.id).toBe(mixed.tracks[2]?.id);
  });

  it("a shuffled queue starts at random and keeps the original order", () => {
    const q = startQueue(album, 0, { shuffled: true, random: () => 0.99 });
    expect(q.original && ids(q.original)).toEqual(["1", "2", "3"]);
  });
});

describe("ReplayGain", () => {
  const rg = create(ReplayGainSchema, { trackGain: -6, trackPeak: 0.9, albumGain: 2, albumPeak: 1.0 });

  it("applies the track or album correction", () => {
    expect(gainFactor(rg, "track")).toBeCloseTo(0.501, 3);
    // +2 dB would ask for 1.26: the album's peak (1.0) stops it at 1.
    expect(gainFactor(rg, "album")).toBe(1);
    expect(gainFactor(create(ReplayGainSchema, { trackGain: 3 }), "track")).toBeCloseTo(1.413, 3);
    expect(gainFactor(rg, "off")).toBe(1);
    expect(gainFactor(undefined, "track")).toBe(1);
  });

  it("says what is applied", () => {
    expect(describeGain(rg, "track")).toBe("Track ReplayGain: −6 dB.");
    expect(describeGain(rg, "album")).toBe(
      "Album ReplayGain: +2 dB, brought down to 0 dB to avoid clipping.",
    );
    expect(describeGain(create(ReplayGainSchema, { trackGain: 1.83 }), "track")).toBe(
      "Track ReplayGain: +1.8 dB.",
    );
    expect(describeGain(undefined, "track")).toBe("This track has no ReplayGain: volume as is.");
  });

  it("takes the album for an album played in order", () => {
    expect(gainModeFor("auto", startQueue(album))).toBe("album");
    expect(gainModeFor("auto", startQueue([t1 as Track, track("x", "b")]))).toBe("track");
    expect(gainModeFor("auto", startQueue(album, 0, { shuffled: true }))).toBe("track");
    expect(gainModeFor("off", startQueue(album))).toBe("off");
  });
});
