import { describe, expect, it } from "vitest";
import { validatePlaySearch } from "./search";

describe("play address", () => {
  it("keeps a valid start position", () => {
    expect(validatePlaySearch({ start: 0 })).toEqual({ start: 0 });
    expect(validatePlaySearch({ start: "125.5" })).toEqual({ start: 125.5 });
  });

  it("ignores the rest: the profile's resume position", () => {
    expect(validatePlaySearch({})).toEqual({});
    expect(validatePlaySearch({ start: "abc" })).toEqual({});
    expect(validatePlaySearch({ start: -3 })).toEqual({});
  });

  it("keeps the playlist and the entry together", () => {
    expect(validatePlaySearch({ playlist: "l", entry: "e" })).toEqual({ playlist: "l", entry: "e" });
    expect(validatePlaySearch({ playlist: "l" })).toEqual({});
  });
});
