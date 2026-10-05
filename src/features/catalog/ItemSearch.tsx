import { useQuery } from "@connectrpc/connect-query";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageKind, pickImage } from "../../api/media";
import { CatalogService, type SearchResult } from "../../gen/laterna/v1/catalog_pb";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import { seriesMeta } from "./cards";
import { episodeCode } from "./format";
import styles from "./itemSearch.module.css";

export type Found = Exclude<SearchResult["item"], { case: undefined }>;
export type FoundCase = Found["case"];

const kinds = {
  movie: "kinds.movie",
  series: "kinds.series",
  episode: "kinds.episode",
  artist: "kinds.artist",
  album: "kinds.album",
  track: "kinds.track",
} as const;

/** Title, detail and image of a result. */
export function describe(it: Found): { title: string; sub: string; image: ReturnType<typeof pickImage> } {
  switch (it.case) {
    case "movie":
      return {
        title: it.value.title,
        sub: it.value.year ? String(it.value.year) : "",
        image: pickImage(it.value.images, ImageKind.POSTER),
      };
    case "series":
      return {
        title: it.value.title,
        sub: seriesMeta(it.value),
        image: pickImage(it.value.images, ImageKind.POSTER),
      };
    case "episode":
      return {
        title: it.value.title,
        sub: `${it.value.seriesTitle} · ${episodeCode(it.value, true)}`,
        image: pickImage(it.value.images, ImageKind.THUMB, ImageKind.POSTER),
      };
    case "artist":
      return { title: it.value.name, sub: "", image: pickImage(it.value.images, ImageKind.POSTER) };
    case "album":
      return {
        title: it.value.title,
        sub: it.value.artistName,
        image: pickImage(it.value.images, ImageKind.POSTER),
      };
    case "track":
      return {
        title: it.value.title,
        sub: [it.value.artists || it.value.artistName, it.value.albumTitle].filter(Boolean).join(" · "),
        image: pickImage(it.value.images, ImageKind.POSTER),
      };
    default:
      return { title: "", sub: "", image: undefined };
  }
}

/**
 * Search in the catalog to choose items to add (collection, playlist): accepted kinds only, a click
 * adds.
 */
export function ItemSearch({
  label,
  placeholder,
  accept,
  onPick,
  busy,
  autoFocus,
}: {
  label: string;
  placeholder: string;
  accept: readonly FoundCase[];
  onPick: (item: Found) => void;
  busy?: boolean;
  /** In a dialog opened to search: the input has focus (see Dialog). */
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const results = useQuery(CatalogService.method.search, { query, limit: 30 }, { enabled: query.length > 0 });
  const found = (results.data?.results ?? [])
    .flatMap((r) => (r.item.case && accept.includes(r.item.case) ? [r.item as Found] : []))
    .slice(0, 8);

  return (
    <div className={styles.search}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.field}>
        <Icon name="search" />
        <input
          id={id}
          type="search"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          data-autofocus={autoFocus || undefined}
        />
      </div>
      {query && (
        <ul className={styles.results} aria-live="polite">
          {found.length === 0 && !results.isPending && (
            <li className={styles.none}>{t("itemSearch.none")}</li>
          )}
          {found.map((it) => {
            const d = describe(it);
            return (
              <li key={`${it.case}-${it.value.id}`}>
                <button type="button" className={styles.result} onClick={() => onPick(it)} disabled={busy}>
                  <Artwork
                    image={d.image}
                    sizes="48px"
                    ratio={
                      it.case === "movie" || it.case === "series" ? 2 / 3 : it.case === "episode" ? 16 / 9 : 1
                    }
                    universe={
                      it.case === "movie"
                        ? "movies"
                        : it.case === "series" || it.case === "episode"
                          ? "series"
                          : "music"
                    }
                    fallback={d.title.slice(0, 1)}
                    shape={
                      it.case === "artist"
                        ? "round"
                        : it.case === "album" || it.case === "track"
                          ? "disc"
                          : "card"
                    }
                    className={styles.art}
                  />
                  <span className={styles.text}>
                    <span className={styles.title}>{d.title}</span>
                    <span className={styles.sub}>
                      {[it.case in kinds ? t(kinds[it.case as keyof typeof kinds]) : "", d.sub]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={styles.add}>{t("itemSearch.add")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
