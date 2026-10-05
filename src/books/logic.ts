// Book logic without a browser: spreads of the page reader, image widths, progress, state of a
// series, relative dates. Tested in logic.test.ts.
import { BookFormat, BookLayout, type BookSummary, type ReadingProgress } from "../gen/laterna/v1/catalog_pb";
import i18n, { num } from "../i18n";

export interface PageSize {
  width: number;
  height: number;
}

/** One page at a time, two pages side by side, or every page one under the other. */
export type PageMode = "single" | "double" | "scroll";

const wide = (p: PageSize | undefined) => p !== undefined && p.width > p.height;

/**
 * Spreads to show, in reading order: page indexes. In double-page mode the cover stays alone, then
 * pages go by two, except a double page (wider than tall) that stays alone.
 */
export function spreads(pages: readonly PageSize[], mode: PageMode): number[][] {
  if (mode !== "double") return pages.map((_, i) => [i]);
  const out: number[][] = [];
  let i = 0;
  while (i < pages.length) {
    const next = i + 1;
    if (i === 0 || wide(pages[i]) || next >= pages.length || wide(pages[next])) {
      out.push([i]);
      i++;
    } else {
      out.push([i, next]);
      i += 2;
    }
  }
  return out;
}

/** Spread that contains a page. */
export function spreadOf(list: readonly number[][], page: number): number {
  const at = list.findIndex((s) => s.includes(page));
  return at < 0 ? 0 : at;
}

/** Progress of a book in pages: the page shown counts as read. */
export function pageProgression(page: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, Math.max(0, (page + 1) / count));
}

/** Volume in the interface language: "3", "0.5". */
export function volume(n: number): string {
  return num(n, { maximumFractionDigits: 2 });
}

export function percent(progression: number): string {
  return i18n.t("books.percent", { n: Math.round(Math.min(1, Math.max(0, progression)) * 100) });
}

/** Where the profile is: "page 45 · 27%", or the percentage alone. */
export function progressLabel(p: ReadingProgress | undefined): string {
  if (!p) return "";
  return p.page > 0
    ? i18n.t("books.pageProgress", { page: p.page + 1, percent: percent(p.progression) })
    : percent(p.progression);
}

export type BookState = "read" | "reading" | "unread";

export function bookState(b: BookSummary): BookState {
  if (b.userData?.played) return "read";
  return (b.progress?.progression ?? 0) > 0 ? "reading" : "unread";
}

/** Book to open in a series: the one in progress, otherwise the first unread, otherwise the first. */
export function bookToContinue(books: readonly BookSummary[]): BookSummary | undefined {
  return (
    books.find((b) => bookState(b) === "reading") ?? books.find((b) => bookState(b) === "unread") ?? books[0]
  );
}

export function formatName(f: BookFormat): string {
  switch (f) {
    case BookFormat.EPUB:
      return "EPUB";
    case BookFormat.PDF:
      return "PDF";
    case BookFormat.CBZ:
      return "CBZ";
    default:
      return BookFormat[f] ?? "";
  }
}

/** How a file reads, in plain words (format choice). */
export function layoutLabel(l: BookLayout): string {
  switch (l) {
    case BookLayout.IMAGES:
      return i18n.t("books.layout.images");
    case BookLayout.REFLOWABLE:
      return i18n.t("books.layout.reflowable");
    case BookLayout.DOCUMENT:
      return i18n.t("books.layout.document");
    default:
      return "";
  }
}
