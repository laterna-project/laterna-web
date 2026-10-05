import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { HomeItemSchema, HomeRowKind, HomeRowSchema } from "../../gen/laterna/v1/home_pb";
import { TextSchema } from "../../gen/laterna/v1/text_pb";
import { greeting, homeBlocks, summary } from "./HomeView";
import { rowTitle, tabLabel } from "./rows";

const row = (kind: HomeRowKind, n = 1) =>
  create(HomeRowSchema, { kind, items: Array.from({ length: n }, () => create(HomeItemSchema, {})) });

describe("home", () => {
  it.each([
    [4, "Good evening"],
    [5, "Hello"],
    [17, "Hello"],
    [18, "Good evening"],
  ])("at %d:00: %s", (h, word) => expect(greeting(h)).toBe(word));

  it("sums up what is in progress", () => {
    expect(
      summary([row(HomeRowKind.RESUME, 2), row(HomeRowKind.NEXT_UP, 1), row(HomeRowKind.READING, 3)]),
    ).toBe("2 items in progress, 1 episode up next, and 3 books started.");
    expect(summary([row(HomeRowKind.NEXT_UP, 4)])).toBe("4 episodes up next.");
    expect(summary([row(HomeRowKind.LATEST_MOVIES, 6)])).toBe("Here are the latest arrivals on the server.");
  });

  it("groups rows by the server's groups, in its order", () => {
    const k = HomeRowKind;
    const blocks = homeBlocks([
      row(k.RESUME),
      row(k.NEXT_UP),
      row(k.READING),
      row(k.LATEST_SERIES),
      row(k.LATEST_MOVIES),
      row(k.RECOMMENDED),
      row(k.BECAUSE_YOU_WATCHED),
      row(k.RECENT_ALBUMS),
      row(k.LATEST_ALBUMS),
      row(k.LATEST_BOOKS),
      row(k.LATEST_PHOTOS),
    ]);
    expect(blocks.map((b) => b.map((r) => r.kind))).toEqual([
      [k.RESUME, k.NEXT_UP, k.READING],
      [k.LATEST_SERIES, k.LATEST_MOVIES],
      [k.RECOMMENDED, k.BECAUSE_YOU_WATCHED],
      [k.RECENT_ALBUMS, k.LATEST_ALBUMS],
      [k.LATEST_BOOKS, k.LATEST_PHOTOS],
    ]);
  });

  it("puts a group in place of its first row; an unknown row stays alone", () => {
    const k = HomeRowKind;
    const blocks = homeBlocks([row(k.RESUME), row(k.UNSPECIFIED), row(k.READING), row(k.LATEST_PHOTOS)]);
    expect(blocks.map((b) => b.map((r) => r.kind))).toEqual([
      [k.RESUME, k.READING],
      [k.UNSPECIFIED],
      [k.LATEST_PHOTOS],
    ]);
  });

  it("translates a row title from title_text, otherwise keeps the server's", () => {
    const latest = create(HomeRowSchema, {
      kind: HomeRowKind.LATEST_MOVIES,
      title: "Recently added in Movies",
      titleText: create(TextSchema, { key: "home.latest", params: { library: "Movies" } }),
    });
    expect(rowTitle(latest)).toBe("Recently added in Movies");
    expect(rowTitle(create(HomeRowSchema, { title: "Server title" }))).toBe("Server title");
  });

  it("names recommendation tabs after their source", () => {
    const because = create(HomeRowSchema, {
      kind: HomeRowKind.BECAUSE_YOU_WATCHED,
      title: "Because you watched Sintel",
      titleText: create(TextSchema, { key: "home.because_you_watched", params: { title: "Sintel" } }),
    });
    expect(tabLabel(because)).toBe("Similar to Sintel");
    expect(
      tabLabel(create(HomeRowSchema, { kind: HomeRowKind.RECOMMENDED, title: "Recommended for you" })),
    ).toBe("Recommended");
  });
});
