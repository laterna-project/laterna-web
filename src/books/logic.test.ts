import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { BookSummarySchema, ReadingProgressSchema, UserDataSchema } from "../gen/laterna/v1/catalog_pb";
import {
  bookState,
  bookToContinue,
  pageProgression,
  progressLabel,
  spreadOf,
  spreads,
  volume,
} from "./logic";

const portrait = { width: 1000, height: 1500 };
const landscape = { width: 2000, height: 1500 };

describe("spreads", () => {
  it("one page at a time", () => {
    expect(spreads([portrait, portrait, portrait], "single")).toEqual([[0], [1], [2]]);
  });

  it("double page: the cover alone, then two by two", () => {
    expect(spreads([portrait, portrait, portrait, portrait, portrait], "double")).toEqual([
      [0],
      [1, 2],
      [3, 4],
    ]);
    expect(spreads([portrait, portrait, portrait, portrait], "double")).toEqual([[0], [1, 2], [3]]);
  });

  it("a double page stays alone", () => {
    expect(spreads([portrait, portrait, landscape, portrait, portrait], "double")).toEqual([
      [0],
      [1],
      [2],
      [3, 4],
    ]);
  });

  it("finds the spread of a page", () => {
    const list = spreads([portrait, portrait, portrait, portrait, portrait], "double");
    expect(spreadOf(list, 4)).toBe(2);
    expect(spreadOf(list, 0)).toBe(0);
  });
});

describe("pages", () => {
  it("counts the page shown as read", () => {
    expect(pageProgression(0, 4)).toBe(0.25);
    expect(pageProgression(3, 4)).toBe(1);
    expect(pageProgression(0, 0)).toBe(0);
  });
});

describe("book state", () => {
  const book = (id: string, played = false, progression = 0) =>
    create(BookSummarySchema, {
      id,
      userData: create(UserDataSchema, { played }),
      progress: progression ? create(ReadingProgressSchema, { progression }) : undefined,
    });

  it("read, reading, unread", () => {
    expect(bookState(book("a", true))).toBe("read");
    expect(bookState(book("a", false, 0.3))).toBe("reading");
    expect(bookState(book("a"))).toBe("unread");
  });

  it("resumes the book in progress, otherwise the first unread", () => {
    expect(bookToContinue([book("a", true), book("b"), book("c", false, 0.5)])?.id).toBe("c");
    expect(bookToContinue([book("a", true), book("b"), book("c")])?.id).toBe("b");
  });

  it("says how far the reading is", () => {
    expect(progressLabel(create(ReadingProgressSchema, { page: 44, progression: 0.27 }))).toBe(
      "page 45 · 27%",
    );
    expect(progressLabel(create(ReadingProgressSchema, { progression: 0.02 }))).toBe("2%");
  });
});

describe("words", () => {
  it("volumes", () => {
    expect(volume(3)).toBe("3");
    expect(volume(0.5)).toBe("0.5");
  });
});
