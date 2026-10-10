import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { SubtitleTrackSchema } from "../gen/laterna/v1/playback_pb";
import {
  SubtitleLanguageSchema,
  SubtitleSearchSchema,
  SubtitleSearchState,
} from "../gen/laterna/v1/subtitle_pb";
import {
  defaultLanguage,
  foundKeys,
  sameTrack,
  searchKey,
  searchLabel,
  searchLanguage,
  underWay,
} from "./subtitleSearch";

const search = (fields: MessageInitShape<typeof SubtitleSearchSchema>) =>
  create(SubtitleSearchSchema, { language: "fr", ...fields });
const language = (code: string, name = "") => create(SubtitleLanguageSchema, { code, name });
const track = (fields: MessageInitShape<typeof SubtitleTrackSchema>) => create(SubtitleTrackSchema, fields);

describe("defaultLanguage", () => {
  const offered = [language("en"), language("fr"), language("ja")];

  it("offers first the language the viewer wants most among those that can be asked for", () => {
    expect(defaultLanguage(offered, "fr-FR", "en")).toBe("fr");
    expect(defaultLanguage(offered, "", "de", "JA")).toBe("ja");
  });

  it("falls back on the first one", () => {
    expect(defaultLanguage(offered, "de", "")).toBe("en");
    expect(defaultLanguage([], "fr")).toBe("");
  });
});

describe("searches", () => {
  it("tells a search from the next one for the same thing", () => {
    const first = search({ state: SubtitleSearchState.NOT_FOUND, startedAt: { seconds: 100n } });
    const second = search({ state: SubtitleSearchState.FOUND, startedAt: { seconds: 900n } });
    expect(searchKey(first)).not.toBe(searchKey(second));
    expect(foundKeys([first, second])).toEqual([searchKey(second)]);
  });

  it("knows when the same thing is already being looked for", () => {
    const searches = [
      search({ state: SubtitleSearchState.SEARCHING, forced: true }),
      search({ state: SubtitleSearchState.NOT_FOUND }),
    ];
    expect(underWay(searches, { language: "fr", hearingImpaired: false, forced: true })).toBe(true);
    expect(underWay(searches, { language: "fr", hearingImpaired: false, forced: false })).toBe(false);
    expect(underWay(searches, { language: "en", hearingImpaired: false, forced: true })).toBe(false);
  });

  it("says where a search stands", () => {
    expect(searchLabel(search({ state: SubtitleSearchState.SEARCHING }))).toBe("French: searching...");
    expect(searchLabel(search({ state: SubtitleSearchState.FOUND, hearingImpaired: true }))).toBe(
      "French · hearing impaired: found, it is in the list.",
    );
    expect(searchLabel(search({ state: SubtitleSearchState.NOT_FOUND, forced: true }))).toBe(
      "French · forced: nothing found.",
    );
  });

  it("says why a search failed, in the interface language when the reason is known", () => {
    const failed = search({ state: SubtitleSearchState.FAILED, error: "Bazarr ne répond pas" });
    expect(searchLabel(failed)).toBe("French: Bazarr ne répond pas");
    expect(searchLabel(search({ state: SubtitleSearchState.FAILED }))).toBe(
      "French: The search could not go through.",
    );
  });

  it("names a language in the interface language, else as Bazarr does", () => {
    expect(searchLanguage(language("fr", "French"))).toBe("French");
    expect(searchLanguage(language("pb", "Brazilian Portuguese"))).not.toBe("");
  });
});

describe("sameTrack", () => {
  const before = [
    track({ index: 0, language: "en", codec: "ass" }),
    track({ index: 1, language: "pt", codec: "subrip", external: true }),
    track({ index: 2, language: "pt", codec: "subrip", external: true }),
  ];
  // A French subtitle was found: it took its place among the external ones.
  const after = [
    track({ index: 0, language: "en", codec: "ass" }),
    track({ index: 1, language: "fr", codec: "subrip", external: true }),
    track({ index: 2, language: "pt", codec: "subrip", external: true }),
    track({ index: 3, language: "pt", codec: "subrip", external: true }),
  ];

  it("follows the chosen subtitle to its new place", () => {
    expect(sameTrack(before, 0, after)).toBe(0);
    expect(sameTrack(before, 1, after)).toBe(2);
    expect(sameTrack(before, 2, after)).toBe(3);
  });

  it("has nothing to follow when no subtitle was chosen, or when it is gone", () => {
    expect(sameTrack(before, null, after)).toBeNull();
    expect(sameTrack(before, undefined, after)).toBeNull();
    expect(sameTrack(before, 1, after.slice(0, 1))).toBeNull();
  });
});
