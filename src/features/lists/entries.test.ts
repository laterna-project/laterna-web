import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { EpisodeSchema, MovieSummarySchema, TrackSchema } from "../../gen/laterna/v1/catalog_pb";
import { PlaylistEntrySchema } from "../../gen/laterna/v1/playlist_pb";
import { moved, nextVideo } from "./entries";

const movie = (id: string) =>
  create(PlaylistEntrySchema, { id, item: { case: "movie", value: create(MovieSummarySchema, { id }) } });
const episode = (id: string) =>
  create(PlaylistEntrySchema, { id, item: { case: "episode", value: create(EpisodeSchema, { id }) } });
const track = (id: string) =>
  create(PlaylistEntrySchema, { id, item: { case: "track", value: create(TrackSchema, { id }) } });

describe("playlists", () => {
  it("continues with the next video, skipping tracks", () => {
    const list = [movie("a"), track("b"), episode("c"), movie("d")];
    expect(nextVideo(list, "a")?.id).toBe("c");
    expect(nextVideo(list, "c")?.id).toBe("d");
    expect(nextVideo(list, "d")).toBeUndefined();
    expect(nextVideo(list, "zz")).toBeUndefined();
  });

  it("moves an entry", () => {
    expect(moved(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moved(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });
});
