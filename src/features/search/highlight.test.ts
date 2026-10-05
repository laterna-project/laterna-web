import { describe, expect, it } from "vitest";
import { matches } from "./highlight";

describe("matches", () => {
  it("finds the start of words, ignoring accents and case", () => {
    expect(matches("Severance", "sev")).toEqual([[0, 3]]);
    expect(matches("Mötley Crüe", "mot")).toEqual([[0, 3]]);
    expect(matches("A Trip to the Moon", "tri moo")).toEqual([
      [2, 5],
      [14, 17],
    ]);
  });

  it("ignores the middle of words", () => {
    expect(matches("Steven", "ev")).toEqual([]);
  });

  it("finds nothing without a search", () => {
    expect(matches("Sintel", "  ")).toEqual([]);
  });
});
