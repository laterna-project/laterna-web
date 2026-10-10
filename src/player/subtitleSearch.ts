// Asking for a subtitle a file does not have (server: docs/design/subtitles.md). The server hands
// the search to Bazarr when an administrator linked it, announces how it ends
// (SubtitleSearchChanged), and the subtitle found joins the list of the file.
import { serverText } from "../api/text";
import { languageName } from "../features/catalog/format";
import type { SubtitleTrack } from "../gen/laterna/v1/playback_pb";
import {
  type SubtitleLanguage,
  type SubtitleSearch,
  SubtitleSearchState,
} from "../gen/laterna/v1/subtitle_pb";
import i18n from "../i18n";

/** What a search asks for. */
export type SearchSpec = Pick<SubtitleSearch, "language" | "hearingImpaired" | "forced">;

/** Identity of a search: what it asks for, and when it started. */
export function searchKey(s: SearchSpec & Pick<SubtitleSearch, "startedAt">): string {
  const at = s.startedAt;
  return [s.language, s.hearingImpaired, s.forced, at?.seconds ?? "", at?.nanos ?? ""].join("|");
}

/** The searches that found a subtitle, by their key. */
export function foundKeys(searches: readonly SubtitleSearch[]): string[] {
  return searches.filter((s) => s.state === SubtitleSearchState.FOUND).map(searchKey);
}

/** A search for the same thing is under way: asking again would only return it. */
export function underWay(searches: readonly SubtitleSearch[], spec: SearchSpec): boolean {
  return searches.some(
    (s) =>
      s.state === SubtitleSearchState.SEARCHING &&
      s.language === spec.language &&
      s.hearingImpaired === spec.hearingImpaired &&
      s.forced === spec.forced,
  );
}

/**
 * The language offered first among those that can be asked for: the first wanted one (the
 * profile's subtitle language, its language, the interface's) that is in the list, else the first
 * of the list.
 */
export function defaultLanguage(languages: readonly SubtitleLanguage[], ...wanted: string[]): string {
  for (const tag of wanted) {
    const code = tag.toLowerCase().split("-")[0];
    if (code && languages.some((l) => l.code === code)) return code;
  }
  return languages[0]?.code ?? "";
}

/** Name of a language Bazarr offers, in the interface language when it is known. */
export function searchLanguage(l: SubtitleLanguage): string {
  return languageName(l.code) || l.name || l.code;
}

/** Where a search stands, in words: "French · forced: searching...". */
export function searchLabel(s: SubtitleSearch): string {
  const what = [
    languageName(s.language) || s.language,
    s.hearingImpaired ? i18n.t("player.hearingImpaired") : "",
    s.forced ? i18n.t("player.forced") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  switch (s.state) {
    case SubtitleSearchState.FOUND:
      return i18n.t("subtitleSearch.found", { what });
    case SubtitleSearchState.NOT_FOUND:
      return i18n.t("subtitleSearch.notFound", { what });
    case SubtitleSearchState.FAILED: {
      const reason = serverText(s.errorText) || s.error || i18n.t("subtitleSearch.failedUnknown");
      return i18n.t("subtitleSearch.failed", { what, reason });
    }
    default:
      return i18n.t("subtitleSearch.searching", { what });
  }
}

/**
 * A subtitle found changes the list of the file, and a subtitle is named by its place in it. The
 * place of the one chosen before, in the list read again: the track that is alike, at the same
 * rank among those alike. Null when none was chosen, or when it is gone.
 */
export function sameTrack(
  before: readonly SubtitleTrack[],
  index: number | null | undefined,
  after: readonly SubtitleTrack[],
): number | null {
  const chosen = before.find((t) => t.index === index);
  if (!chosen) return null;
  const alike = (t: SubtitleTrack) =>
    t.language === chosen.language &&
    t.title === chosen.title &&
    t.codec === chosen.codec &&
    t.external === chosen.external &&
    t.forced === chosen.forced &&
    t.hearingImpaired === chosen.hearingImpaired;
  const rank = before.filter(alike).indexOf(chosen);
  return after.filter(alike)[rank]?.index ?? null;
}
