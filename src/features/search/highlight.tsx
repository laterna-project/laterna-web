import { Fragment, type ReactNode } from "react";

/** Letter without accent or case, one letter for one letter (positions stay the same). */
function fold(s: string): string {
  return Array.from(s, (c) => c.normalize("NFD").charAt(0).toLowerCase()).join("");
}

/**
 * Parts of a title that match the search: each word searched may be only the start of a word of the
 * title, ignoring accents and case (like the server).
 */
export function matches(text: string, query: string): [number, number][] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chars = Array.from(text);
  const folded = Array.from(fold(text));
  const ranges: [number, number][] = [];
  for (let i = 0; i < folded.length; i++) {
    const startOfWord = i === 0 || !/[\p{L}\p{N}]/u.test(folded[i - 1] ?? "");
    if (!startOfWord) continue;
    let best = 0;
    for (const w of words) {
      if (folded.slice(i, i + w.length).join("") === w) best = Math.max(best, w.length);
    }
    if (best > 0) {
      ranges.push([i, i + best]);
      i += best - 1;
    }
  }
  return chars.length > 0 ? ranges : [];
}

/** Title with the matching parts underlined. */
export function Highlight({ text, query, className }: { text: string; query: string; className?: string }) {
  const chars = Array.from(text);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of matches(text, query)) {
    if (start > at) parts.push(<Fragment key={`t${at}`}>{chars.slice(at, start).join("")}</Fragment>);
    parts.push(
      <mark key={`m${start}`} className={className}>
        {chars.slice(start, end).join("")}
      </mark>,
    );
    at = end;
  }
  if (at < chars.length) parts.push(<Fragment key={`t${at}`}>{chars.slice(at).join("")}</Fragment>);
  return <>{parts}</>;
}
