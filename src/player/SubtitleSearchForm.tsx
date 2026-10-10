import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../api/errors";
import { useInvalidate } from "../api/invalidate";
import { type GetSubtitleSearchResponse, SubtitleService } from "../gen/laterna/v1/subtitle_pb";
import styles from "./player.module.css";
import {
  defaultLanguage,
  foundKeys,
  searchKey,
  searchLabel,
  searchLanguage,
  underWay,
} from "./subtitleSearch";

/**
 * Whether a subtitle can be asked for a file, in which languages, and where its searches stand.
 * Read as long as the player is open, whatever panel it shows: when a search finds a subtitle,
 * onFound is called and the player reads the subtitles of the file again. The event stream says
 * when to read the searches again (src/api/events.ts).
 */
export function useSubtitleSearch(
  fileId: string | undefined,
  onFound: () => void,
): GetSubtitleSearchResponse | undefined {
  const search = useQuery(
    SubtitleService.method.getSubtitleSearch,
    { fileId: fileId ?? "" },
    { enabled: Boolean(fileId), retry: false },
  );
  const seen = useRef<{ fileId: string; keys: Set<string> }>(undefined);
  const found = useRef(onFound);
  found.current = onFound;
  const data = search.data;
  useEffect(() => {
    if (!data || !fileId) return;
    const keys = foundKeys(data.searches);
    // What was found before the playback opened is already in its list.
    if (seen.current?.fileId !== fileId) {
      seen.current = { fileId, keys: new Set(keys) };
      return;
    }
    const known = seen.current.keys;
    const fresh = keys.filter((k) => !known.has(k));
    for (const k of fresh) known.add(k);
    if (fresh.length > 0) found.current();
  }, [data, fileId]);
  return data;
}

/**
 * "Missing a subtitle?": a language, two options, and the searches of the file with how each
 * ended. Shows nothing when subtitles cannot be looked up (no Bazarr linked, or a server that has
 * no such search).
 */
export function SubtitleSearchForm({
  fileId,
  search,
  wanted,
}: {
  fileId: string;
  search: GetSubtitleSearchResponse | undefined;
  /** Languages to offer first, most wanted first (BCP 47 tags). */
  wanted: readonly string[];
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const ask = useMutation(SubtitleService.method.searchSubtitle, {
    onSuccess: () => invalidate(SubtitleService),
  });
  const [picked, setPicked] = useState("");
  const [hearingImpaired, setHearingImpaired] = useState(false);
  const [forced, setForced] = useState(false);
  if (!search?.available || search.languages.length === 0) return null;
  const language = picked || defaultLanguage(search.languages, ...wanted);
  const spec = { language, hearingImpaired, forced };

  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupTitle}>{t("subtitleSearch.title")}</legend>
      <form
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          ask.mutate({ fileId, ...spec });
        }}
      >
        <label className={styles.searchField}>
          <span>{t("subtitleSearch.language")}</span>
          <select className={styles.select} value={language} onChange={(e) => setPicked(e.target.value)}>
            {search.languages.map((l) => (
              <option key={l.code} value={l.code}>
                {searchLanguage(l)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={hearingImpaired}
            onChange={(e) => setHearingImpaired(e.target.checked)}
          />
          {t("subtitleSearch.hearingImpaired")}
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={forced} onChange={(e) => setForced(e.target.checked)} />
          {t("subtitleSearch.forced")}
        </label>
        <button
          type="submit"
          className={styles.pill}
          disabled={ask.isPending || underWay(search.searches, spec)}
        >
          {t("subtitleSearch.search")}
        </button>
      </form>
      {ask.isError && (
        <p className={styles.note} role="alert">
          {errorMessage(ask.error)}
        </p>
      )}
      {/* The region exists before its messages, so that screen readers announce how a search ends. */}
      <div role="status" className={styles.searches}>
        {search.searches.map((s) => (
          <p key={searchKey(s)} className={styles.note}>
            {searchLabel(s)}
          </p>
        ))}
      </div>
    </fieldset>
  );
}
