import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { formatRuntime, ImageKind, pickImage, seconds } from "../../api/media";
import { movieMeta, seriesMeta } from "../../features/catalog/cards";
import { episodeCode } from "../../features/catalog/format";
import { albumMeta } from "../../features/music/cards";
import { usePlay } from "../../features/music/usePlay";
import { Highlight } from "../../features/search/highlight";
import styles from "../../features/search/search.module.css";
import { CatalogService, type SearchResult, type Track } from "../../gen/laterna/v1/catalog_pb";
import type { Universe } from "../../theme/contract";
import { universeBlock } from "../../theme/universe";
import { Alert } from "../../ui/Alert";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";

export const Route = createFileRoute("/_app/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  component: SearchPage,
});

type Item = SearchResult["item"];
type Group = "movies" | "series" | "episodes" | "music" | "books" | "photos";

const groups = [
  { id: "movies", label: "nav.movies", universe: "movies", cases: ["movie"] },
  { id: "series", label: "nav.series", universe: "series", cases: ["series"] },
  { id: "episodes", label: "kinds.episodes", universe: "series", cases: ["episode"] },
  { id: "music", label: "nav.music", universe: "music", cases: ["artist", "album", "track"] },
  { id: "books", label: "nav.books", universe: "books", cases: ["bookSeries", "book"] },
  { id: "photos", label: "kinds.photoAlbums", universe: "photos", cases: ["photoAlbum"] },
] as const satisfies readonly {
  id: Group;
  label: string;
  universe: Universe;
  cases: readonly Item["case"][];
}[];

function groupOf(item: Item): Group | undefined {
  return groups.find((g) => (g.cases as readonly Item["case"][]).includes(item.case))?.id;
}

function SearchPage() {
  const { t } = useTranslation();
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [text, setText] = useState(q);
  const [filter, setFilter] = useState<Group | "all">("all");

  // The address follows what is typed (a search can be shared or returned to), without jank.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.trim() !== q) void navigate({ search: text.trim() ? { q: text.trim() } : {}, replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [text, q, navigate]);

  const results = useQuery(CatalogService.method.search, { query: q, limit: 50 }, { enabled: q.length > 0 });
  const items = (results.data?.results ?? []).map((r) => r.item).filter((i) => i.case !== undefined);
  const counts = new Map<Group, number>();
  for (const i of items) {
    const g = groupOf(i);
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const shown = filter === "all" ? items : items.filter((i) => groupOf(i) === filter);
  // The server ranks movies, series, artists and albums first: the first of them is highlighted.
  const best =
    filter === "all"
      ? shown.find(
          (i) => i.case === "movie" || i.case === "series" || i.case === "artist" || i.case === "album",
        )
      : undefined;
  const rest = shown.filter((i) => i !== best);

  return (
    <div className={styles.page}>
      <h1 className="sr-only">{q ? t("search.titleQuery", { q }) : t("search.title")}</h1>
      <search>
        <form className={styles.box} onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="search" className={styles.label}>
            <Icon name="search" size={28} />
            <span className={styles.hidden}>{t("search.label")}</span>
          </label>
          <input
            id="search"
            className={styles.input}
            data-large
            type="search"
            // biome-ignore lint/a11y/noAutofocus: people come here to type a search
            autoFocus
            placeholder={t("search.placeholder")}
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {/* Always present: the number of results is announced at each keystroke. */}
          <span role="status" className={q && results.data ? styles.count : "sr-only"}>
            {q && results.data ? t("counts.results", { count: items.length }) : ""}
          </span>
        </form>
      </search>

      {q && items.length > 0 && (
        <fieldset className={styles.filters}>
          <legend className="sr-only">{t("search.filter")}</legend>
          <button
            type="button"
            aria-pressed={filter === "all"}
            className={styles.filter}
            onClick={() => setFilter("all")}
          >
            {t("search.all")}
          </button>
          {groups
            .filter((g) => counts.has(g.id))
            .map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={filter === g.id}
                className={styles.filter}
                onClick={() => setFilter(g.id)}
              >
                <span className={styles.dot} style={{ background: `var(--color-${g.universe})` }} />
                {t(g.label)} · {counts.get(g.id)}
              </button>
            ))}
        </fieldset>
      )}

      {results.isError && <Alert>{errorMessage(results.error)}</Alert>}
      {q && results.data && items.length === 0 && <p className={styles.empty}>{t("search.empty", { q })}</p>}

      {best && <Best item={best} query={q} />}
      {rest.length > 0 && (
        <ul className={styles.results}>
          {rest.map((i) => (
            <li key={`${i.case}-${(i.value as { id: string }).id}`}>
              <ResultLine item={i} query={q} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Best({ item, query }: { item: Item; query: string }) {
  const { t } = useTranslation();
  const card = (
    universe: Universe,
    kind: string,
    title: string,
    meta: string,
    image: ReturnType<typeof pickImage>,
    shape: "poster" | "disc" | "round",
  ) => ({
    style: universeBlock(universe),
    content: (
      <>
        <Artwork
          image={image}
          sizes="160px"
          ratio={shape === "poster" ? 2 / 3 : 1}
          universe={universe}
          fallback={title}
          shape={shape}
          className={styles.bestArt}
        />
        <span className={styles.bestBody}>
          <span className={styles.bestLabel}>{t("search.best", { kind })}</span>
          <span className={styles.bestTitle}>
            <Highlight text={title} query={query} className={styles.mark} />
          </span>
          <span>{meta}</span>
        </span>
      </>
    ),
  });
  switch (item.case) {
    case "movie": {
      const v = item.value;
      const c = card(
        "movies",
        t("kinds.movie"),
        v.title,
        movieMeta(v),
        pickImage(v.images, ImageKind.POSTER),
        "poster",
      );
      return (
        <Link to="/movies/$id" params={{ id: v.id }} className={styles.best} style={c.style}>
          {c.content}
        </Link>
      );
    }
    case "series": {
      const v = item.value;
      const c = card(
        "series",
        t("kinds.series"),
        v.title,
        seriesMeta(v),
        pickImage(v.images, ImageKind.POSTER),
        "poster",
      );
      return (
        <Link to="/series/$id" params={{ id: v.id }} className={styles.best} style={c.style}>
          {c.content}
        </Link>
      );
    }
    case "artist": {
      const v = item.value;
      const meta = `${t("counts.albums", { count: v.albumCount })} · ${t("counts.tracks", { count: v.trackCount })}`;
      const c = card(
        "music",
        t("kinds.artist"),
        v.name,
        meta,
        pickImage(v.images, ImageKind.POSTER, ImageKind.THUMB),
        "round",
      );
      return (
        <Link to="/music/artists/$id" params={{ id: v.id }} className={styles.best} style={c.style}>
          {c.content}
        </Link>
      );
    }
    case "album": {
      const v = item.value;
      const c = card(
        "music",
        t("kinds.album"),
        v.title,
        albumMeta(v),
        pickImage(v.images, ImageKind.POSTER),
        "disc",
      );
      return (
        <Link to="/music/albums/$id" params={{ id: v.id }} className={styles.best} style={c.style}>
          {c.content}
        </Link>
      );
    }
    default:
      return null;
  }
}

/** A line of search results. */
function ResultLine({ item, query }: { item: Item; query: string }) {
  const { t } = useTranslation();
  const book = item.case === "book" || item.case === "bookSeries";
  const line = (
    universe: Universe,
    kind: string,
    title: string,
    sub: string,
    images: ReturnType<typeof imagesOf>,
  ) => (
    <>
      <Artwork
        image={images}
        sizes="64px"
        ratio={item.case === "episode" ? 16 / 9 : book ? 2 / 3 : 1}
        universe={universe}
        fallback={title.slice(0, 1)}
        shape={
          item.case === "artist"
            ? "round"
            : item.case === "album" || item.case === "track"
              ? "disc"
              : book
                ? "cover"
                : "card"
        }
        className={item.case === "episode" ? styles.wideArt : styles.art}
      />
      <span className={styles.lineBody}>
        <span className={styles.lineKind} style={{ color: `var(--color-${universe}-text)` }}>
          {kind}
        </span>
        <span className={styles.lineTitle}>
          <Highlight text={title} query={query} className={styles.mark} />
        </span>
        {sub && <span className={styles.lineSub}>{sub}</span>}
      </span>
    </>
  );
  switch (item.case) {
    case "movie":
      return (
        <Link to="/movies/$id" params={{ id: item.value.id }} className={styles.line}>
          {line("movies", t("kinds.movie"), item.value.title, movieMeta(item.value), imagesOf(item))}
        </Link>
      );
    case "series":
      return (
        <Link to="/series/$id" params={{ id: item.value.id }} className={styles.line}>
          {line("series", t("kinds.series"), item.value.title, seriesMeta(item.value), imagesOf(item))}
        </Link>
      );
    case "episode": {
      const e = item.value;
      return (
        <Link to="/episodes/$id" params={{ id: e.id }} className={styles.line}>
          {line(
            "series",
            t("kinds.episode"),
            e.title,
            `${e.seriesTitle} · ${episodeCode(e, true)}${e.runtime ? ` · ${formatRuntime(seconds(e.runtime))}` : ""}`,
            imagesOf(item),
          )}
        </Link>
      );
    }
    case "artist":
      return (
        <Link to="/music/artists/$id" params={{ id: item.value.id }} className={styles.line}>
          {line(
            "music",
            t("kinds.artist"),
            item.value.name,
            t("counts.albums", { count: item.value.albumCount }),
            imagesOf(item),
          )}
        </Link>
      );
    case "album":
      return (
        <Link to="/music/albums/$id" params={{ id: item.value.id }} className={styles.line}>
          {line(
            "music",
            t("kinds.album"),
            item.value.title,
            [item.value.artistName, item.value.year || null].filter(Boolean).join(" · "),
            imagesOf(item),
          )}
        </Link>
      );
    case "track":
      return (
        <TrackLine track={item.value}>
          {line(
            "music",
            t("kinds.track"),
            item.value.title,
            [item.value.artists || item.value.artistName, item.value.albumTitle].filter(Boolean).join(" · "),
            imagesOf(item),
          )}
        </TrackLine>
      );
    case "bookSeries":
      return (
        <Link to="/bookshelf/series/$id" params={{ id: item.value.id }} className={styles.line}>
          {line(
            "books",
            t("kinds.bookSeries"),
            item.value.title,
            t("counts.books", { count: item.value.bookCount }),
            imagesOf(item),
          )}
        </Link>
      );
    case "book":
      return (
        <Link to="/bookshelf" search={{ book: item.value.id }} className={styles.line}>
          {line(
            "books",
            t("kinds.book"),
            item.value.title,
            item.value.seriesTitle
              ? `${item.value.seriesTitle}${item.value.number ? ` · ${t("counts.volume", { n: item.value.number })}` : ""}`
              : "",
            imagesOf(item),
          )}
        </Link>
      );
    case "photoAlbum":
      return (
        <Link to="/photos/albums/$id" params={{ id: item.value.id }} className={styles.line}>
          {line(
            "photos",
            t("kinds.photoAlbum"),
            item.value.title,
            t("counts.photos", { count: item.value.photoCount }),
            imagesOf(item),
          )}
        </Link>
      );
    default:
      return null;
  }
}

function imagesOf(item: Item) {
  const v = item.value as { images?: Parameters<typeof pickImage>[0] } | undefined;
  return pickImage(v?.images ?? [], ImageKind.THUMB, ImageKind.POSTER, ImageKind.BACKDROP);
}

/** A track found: its album plays from it. */
function TrackLine({ track, children }: { track: Track; children: ReactNode }) {
  const { t } = useTranslation();
  const play = usePlay();
  return (
    <button
      type="button"
      className={styles.line}
      onClick={() => void play.album(track.albumId, { trackId: track.id })}
      aria-label={t("search.listen", { title: track.title })}
    >
      {children}
    </button>
  );
}
