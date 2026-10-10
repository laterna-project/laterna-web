import { Link, type LinkProps } from "@tanstack/react-router";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRuntime, ImageKind, mediaUrl, pickImage, seconds } from "../../api/media";
import { named, serverText } from "../../api/text";
import { progressLabel } from "../../books/logic";
import type { BookSummary, Episode, PhotoSummary } from "../../gen/laterna/v1/catalog_pb";
import { type HomeRow, HomeRowKind, UpcomingKind, type UpcomingRelease } from "../../gen/laterna/v1/home_pb";
import i18n from "../../i18n";
import type { Universe } from "../../theme/contract";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import { scrollBehavior } from "../../ui/motion";
import { bookMeta, Cover } from "../books/cards";
import { MovieCard, SeriesCard } from "../catalog/cards";
import { episodeCode } from "../catalog/format";
import { AlbumCard } from "../music/cards";
import styles from "./home.module.css";
import { upcomingKey, upcomingLines, upcomingUniverse, whenLabel } from "./upcoming";

type Item = HomeRow["items"][number]["item"];

/** Universe (color of the dot) of a row from its kind. */
export function rowUniverse(kind: HomeRowKind): Universe {
  switch (kind) {
    case HomeRowKind.RESUME:
    case HomeRowKind.LATEST_MOVIES:
      return "movies";
    case HomeRowKind.NEXT_UP:
    case HomeRowKind.LATEST_SERIES:
      return "series";
    case HomeRowKind.RECENT_ALBUMS:
    case HomeRowKind.LATEST_ALBUMS:
      return "music";
    case HomeRowKind.READING:
    case HomeRowKind.LATEST_BOOKS:
      return "books";
    case HomeRowKind.LATEST_PHOTOS:
      return "photos";
    case HomeRowKind.BECAUSE_YOU_WATCHED:
      return "playlists";
    default:
      return "collections";
  }
}

/** Page that shows a whole row: recently added, recommendations; none for the others. */
function moreLink(row: HomeRow): LinkProps | undefined {
  const search = { library: row.libraryId || undefined };
  switch (row.kind) {
    case HomeRowKind.RECOMMENDED:
    case HomeRowKind.BECAUSE_YOU_WATCHED:
      return { to: "/discover" };
    case HomeRowKind.LATEST_MOVIES:
      return { to: "/movies", search };
    case HomeRowKind.LATEST_SERIES:
      return { to: "/series", search };
    case HomeRowKind.LATEST_ALBUMS:
      return { to: "/music", search };
    case HomeRowKind.LATEST_BOOKS:
      return { to: "/bookshelf", search };
    case HomeRowKind.LATEST_PHOTOS:
      return { to: "/photos" };
    default:
      return undefined;
  }
}

/**
 * Home groups, the server's (server: docs/design/home.md): what is in progress; new to watch
 * (movies and series); recommendations; music; recently added books and photos. Rows of the same
 * group form one block with tabs.
 */
export type Family = "inProgress" | "newToWatch" | "forYou" | "music" | "latest";

export function rowFamily(kind: HomeRowKind): Family | undefined {
  switch (kind) {
    case HomeRowKind.RESUME:
    case HomeRowKind.NEXT_UP:
    case HomeRowKind.READING:
      return "inProgress";
    case HomeRowKind.LATEST_MOVIES:
    case HomeRowKind.LATEST_SERIES:
      return "newToWatch";
    case HomeRowKind.RECOMMENDED:
    case HomeRowKind.BECAUSE_YOU_WATCHED:
      return "forYou";
    case HomeRowKind.RECENT_ALBUMS:
    case HomeRowKind.LATEST_ALBUMS:
      return "music";
    case HomeRowKind.LATEST_BOOKS:
    case HomeRowKind.LATEST_PHOTOS:
      return "latest";
    default:
      return undefined;
  }
}

/** Recommendations: those of home, and of Discover. */
export function isRecommendation(kind: HomeRowKind): boolean {
  return rowFamily(kind) === "forYou";
}

/** Title of a row in the interface language (title_text), otherwise the server's. */
export function rowTitle(row: HomeRow): string {
  return serverText(row.titleText) || row.title;
}

/**
 * Name of a tab: "Recommended", "Similar to Sintel" ("Because you watched Sintel" is too long for a
 * tab), otherwise the row's title.
 */
export function tabLabel(row: HomeRow): string {
  if (row.kind === HomeRowKind.RECOMMENDED) return i18n.t("home.tabs.recommended");
  const source = row.titleText?.params.title;
  if (row.kind === HomeRowKind.BECAUSE_YOU_WATCHED && source)
    return i18n.t("home.tabs.because", { title: source });
  return rowTitle(row);
}

/** Library of a recently added row, for its tab. */
function libraryOf(row: HomeRow, libraryName: (id: string) => string | undefined): string {
  return libraryName(row.libraryId) ?? row.titleText?.params.library ?? rowTitle(row);
}

/** A home block: a single row, or rows of the same family grouped into tabs. */
export function Block({
  rows,
  index,
  libraryName,
}: {
  rows: readonly HomeRow[];
  index: number;
  libraryName: (id: string) => string | undefined;
}) {
  const { t } = useTranslation();
  const id = `row-${index}`;
  const [first] = rows;
  if (!first) return null;
  if (rows.length === 1) return <SingleRow id={id} row={first} />;
  // Recently added: one tab per library; alone in its block, it just says "Recently added".
  const latest = rows.filter((r) => r.libraryId);
  const label = (r: HomeRow) =>
    !r.libraryId ? tabLabel(r) : latest.length > 1 ? libraryOf(r, libraryName) : t("home.blocks.latest");
  switch (rowFamily(first.kind)) {
    case "newToWatch":
      return <TabsBlock id={id} heading={t("home.blocks.newToWatch")} rows={rows} label={label} />;
    case "forYou":
      return <TabsBlock id={id} heading={t("home.blocks.forYou")} rows={rows} label={tabLabel} />;
    case "music":
      return <TabsBlock id={id} heading={t("home.blocks.music")} rows={rows} label={label} />;
    case "latest":
      return <TabsBlock id={id} heading={t("home.blocks.latest")} rows={rows} label={label} />;
    default:
      return <TabsBlock id={id} heading={t("home.blocks.inProgress")} rows={rows} label={rowTitle} />;
  }
}

function SingleRow({ id, row }: { id: string; row: HomeRow }) {
  const strip = useStrip(row.items.length + row.upcoming.length);
  return (
    <section className={styles.section} aria-labelledby={id} data-ui="home-block">
      <div className={styles.head} data-ui="block-head">
        <h2 id={id} className={styles.heading} data-ui="block-title">
          <Dot universe={rowUniverse(row.kind)} />
          {rowTitle(row)}
        </h2>
        <HeadTools title={rowTitle(row)} more={moreLink(row)} strip={strip} />
      </div>
      <RowStrip row={row} stripRef={strip.ref} />
    </section>
  );
}

/** Several rows under one title: one tab per row, in the server's order. */
function TabsBlock({
  id,
  heading,
  rows,
  label,
}: {
  id: string;
  heading: string;
  rows: readonly HomeRow[];
  /** Name of the tab: the library for recently added, otherwise the server's title. */
  label: (row: HomeRow) => string;
}) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.min(active, rows.length - 1);
  const row = rows[index] as HomeRow;
  const strip = useStrip(row.items.length, index);

  // Tabs keyboard: arrows (wrapping), Home and End; the tab reached is selected.
  const onKeyDown = (e: KeyboardEvent) => {
    const last = rows.length - 1;
    const next =
      e.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section className={styles.section} aria-labelledby={id} data-ui="home-block">
      <div className={styles.head} data-ui="block-head">
        <h2 id={id} className={styles.heading} data-ui="block-title">
          {heading}
        </h2>
        <div className={styles.tabs} role="tablist" aria-labelledby={id} data-ui="tabs">
          {rows.map((r, i) => (
            <button
              key={`${r.kind}-${r.libraryId}`}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              className={styles.tab}
              data-ui="tab"
              data-universe={rowUniverse(r.kind)}
              aria-selected={i === index}
              aria-controls={`${id}-panel`}
              tabIndex={i === index ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={onKeyDown}
            >
              <Dot universe={rowUniverse(r.kind)} />
              {label(r)}
            </button>
          ))}
        </div>
        <HeadTools title={rowTitle(row)} more={moreLink(row)} strip={strip} />
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${index}`}>
        <RowStrip key={`${row.kind}-${row.libraryId}`} row={row} stripRef={strip.ref} />
      </div>
    </section>
  );
}

function Dot({ universe }: { universe: Universe }) {
  return (
    <span className={styles.dot} style={{ background: `var(--color-${universe})` }} aria-hidden="true" />
  );
}

/** On the right of the header: "See all" and the strip's arrows when it overflows. */
function HeadTools({ title, more, strip }: { title: string; more?: LinkProps; strip: Strip }) {
  const { t } = useTranslation();
  const overflow = !(strip.atStart && strip.atEnd);
  if (!more && !overflow) return null;
  return (
    <div className={styles.tools}>
      {more && (
        <Link {...more} className={styles.more} aria-label={t("home.seeAllOf", { title })} data-ui="see-all">
          {t("common.seeAll")}
          <Icon name="chevron" size={16} />
        </Link>
      )}
      {overflow && (
        <>
          <button
            type="button"
            className={`${styles.scroll} ${styles.scrollBack}`}
            data-ui="strip-arrow"
            aria-label={t("home.previous")}
            disabled={strip.atStart}
            onClick={() => strip.scroll(-1)}
          >
            <Icon name="chevron" size={18} />
          </button>
          <button
            type="button"
            className={styles.scroll}
            data-ui="strip-arrow"
            aria-label={t("home.next")}
            disabled={strip.atEnd}
            onClick={() => strip.scroll(1)}
          >
            <Icon name="chevron" size={18} />
          </button>
        </>
      )}
    </div>
  );
}

interface Strip {
  ref: (el: HTMLUListElement | null) => void;
  atStart: boolean;
  atEnd: boolean;
  scroll: (direction: 1 | -1) => void;
}

/** Scrolling strip: whether its edges are reached, and scrolling by one strip width. */
function useStrip(...deps: unknown[]): Strip {
  const [el, setEl] = useState<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });
  // Read again when the content (deps) changes: it changes the width to scroll.
  useEffect(() => {
    if (!el) return;
    const update = () =>
      setEdges({
        atStart: el.scrollLeft <= 1,
        atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [el, ...deps]);
  return {
    ref: setEl,
    ...edges,
    scroll: (direction) => {
      el?.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: scrollBehavior() });
    },
  };
}

/** The items of a row, on a single line, in the presentation of their kind. */
function RowStrip({ row, stripRef }: { row: HomeRow; stripRef: Strip["ref"] }) {
  const items = row.items.map((i) => i.item);
  switch (row.kind) {
    case HomeRowKind.RESUME:
      return (
        <ul ref={stripRef} data-ui="strip" className={`${styles.strip} ${styles.episodes}`}>
          {items.map(resumable).map((r) => r && <ResumeCard key={r.id} item={r} />)}
        </ul>
      );
    case HomeRowKind.NEXT_UP:
      return (
        <ul ref={stripRef} data-ui="strip" className={`${styles.strip} ${styles.episodes}`}>
          {items.map((it) => it.case === "episode" && <EpisodeCard key={it.value.id} episode={it.value} />)}
        </ul>
      );
    case HomeRowKind.LATEST_MOVIES:
    case HomeRowKind.LATEST_SERIES:
    case HomeRowKind.RECOMMENDED:
    case HomeRowKind.BECAUSE_YOU_WATCHED:
      return (
        <ul ref={stripRef} data-ui="strip" className={`${styles.strip} ${styles.posters}`}>
          {items.map((it) =>
            it.case === "movie" ? (
              <li key={it.value.id}>
                <MovieCard movie={it.value} />
              </li>
            ) : it.case === "series" ? (
              <li key={it.value.id}>
                <SeriesCard series={it.value} />
              </li>
            ) : null,
          )}
        </ul>
      );
    case HomeRowKind.RECENT_ALBUMS:
    case HomeRowKind.LATEST_ALBUMS:
      return (
        <ul ref={stripRef} data-ui="strip" className={`${styles.strip} ${styles.albums}`}>
          {items.map(
            (it) =>
              it.case === "album" && (
                <li key={it.value.id}>
                  <AlbumCard album={it.value} />
                </li>
              ),
          )}
        </ul>
      );
    case HomeRowKind.READING:
    case HomeRowKind.LATEST_BOOKS:
      return (
        <ul ref={stripRef} data-ui="strip" className={`${styles.strip} ${styles.books}`}>
          {items.map(
            (it) =>
              it.case === "book" && (
                <BookItem key={it.value.id} book={it.value} reading={row.kind === HomeRowKind.READING} />
              ),
          )}
        </ul>
      );
    case HomeRowKind.LATEST_PHOTOS:
      return (
        <ul ref={stripRef} data-ui="strip" className={`${styles.strip} ${styles.photos}`}>
          {items.map((it) => it.case === "photo" && <PhotoTile key={it.value.id} photo={it.value} />)}
        </ul>
      );
    case HomeRowKind.UPCOMING:
      return (
        <ul ref={stripRef} data-ui="strip" className={`${styles.strip} ${styles.posters}`}>
          {row.upcoming.map((u) => (
            <UpcomingCard key={upcomingKey(u)} release={u} />
          ))}
        </ul>
      );
    default:
      return null;
  }
}

// --- Coming soon --------------------------------------------------------------------------------

/**
 * Something on its way: an episode, a movie or an album the server does not have yet. It opens the
 * series or the artist when the catalog has it; a movie, or a series with nothing yet, opens
 * nothing.
 */
function UpcomingCard({ release: u }: { release: UpcomingRelease }) {
  const { title, meta } = upcomingLines(u);
  const universe = upcomingUniverse(u.kind);
  const album = u.kind === UpcomingKind.ALBUM;
  const image = pickImage(u.images, ImageKind.POSTER, ImageKind.THUMB, ImageKind.BACKDROP);
  const ratio = album ? 1 : 2 / 3;
  const body = (
    <>
      {/* Without an image, only the color of the universe: the date sits where a title would. */}
      <span className={styles.art}>
        {image || !u.posterUrl ? (
          <Artwork
            image={image}
            sizes="180px"
            ratio={ratio}
            universe={universe}
            shape={album ? "disc" : "poster"}
          />
        ) : (
          <RemotePoster url={u.posterUrl} ratio={ratio} universe={universe} />
        )}
        <span className={styles.when} data-ui="badge">
          {whenLabel(u)}
        </span>
      </span>
      <span className={styles.cardTitle} data-ui="card-title">
        {title}
      </span>
      {meta && (
        <span className={styles.muted} data-ui="card-meta">
          {meta}
        </span>
      )}
    </>
  );
  const card = (children: ReactNode) =>
    u.itemId && u.kind !== UpcomingKind.MOVIE ? (
      <Link
        to={album ? "/music/artists/$id" : "/series/$id"}
        params={{ id: u.itemId }}
        className={styles.card}
        data-ui="card"
        data-kind="upcoming"
        data-universe={universe}
      >
        {children}
      </Link>
    ) : (
      <div className={styles.card} data-ui="card" data-kind="upcoming" data-universe={universe}>
        {children}
      </div>
    );
  return <li>{card(body)}</li>;
}

/** Poster the server fetched for a title the catalog does not have (the route of request posters). */
function RemotePoster({ url, ratio, universe }: { url: string; ratio: number; universe: Universe }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={styles.remote}
      style={{ aspectRatio: String(ratio), background: `var(--color-${universe}-soft)` }}
    >
      {!failed && (
        <img src={mediaUrl(url)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

// --- Resume -------------------------------------------------------------------------------------

interface Resumable {
  id: string;
  /** Detail page to open: a movie, or a series' episode. */
  link: { to: "/movies/$id" | "/episodes/$id"; id: string };
  /** Player, opened at the resume position. */
  play: "/play/movie/$id" | "/play/episode/$id";
  title: string;
  meta: string;
  image: ReturnType<typeof pickImage>;
  position: number;
  runtime: number;
  universe: Universe;
}

function resumable(it: Item): Resumable | null {
  if (it.case === "movie") {
    const m = it.value;
    return {
      id: m.id,
      link: { to: "/movies/$id", id: m.id },
      play: "/play/movie/$id",
      title: m.title,
      meta: [m.year || null, m.runtime && formatRuntime(seconds(m.runtime))].filter(Boolean).join(" · "),
      image: pickImage(m.images, ImageKind.BACKDROP, ImageKind.THUMB, ImageKind.POSTER),
      position: seconds(m.userData?.position),
      runtime: seconds(m.runtime),
      universe: "movies",
    };
  }
  if (it.case === "episode") {
    const e = it.value;
    return {
      id: e.id,
      link: { to: "/episodes/$id", id: e.id },
      play: "/play/episode/$id",
      title: e.seriesTitle,
      meta: `${episodeCode(e)} · ${named(e.title, e.titleText)}`,
      image: pickImage(e.images, ImageKind.THUMB, ImageKind.BACKDROP, ImageKind.POSTER),
      position: seconds(e.userData?.position),
      runtime: seconds(e.runtime),
      universe: "series",
    };
  }
  return null;
}

/** Started playback: the detail page on click, resuming with the button shown on hover. */
function ResumeCard({ item: r }: { item: Resumable }) {
  const { t } = useTranslation();
  const pct = r.runtime > 0 ? Math.min(100, (r.position / r.runtime) * 100) : 0;
  return (
    <li className={styles.card} data-ui="card" data-kind="resume" data-universe={r.universe}>
      <span className={styles.art}>
        <Link to={r.link.to} params={{ id: r.link.id }} tabIndex={-1} aria-hidden="true">
          <Artwork image={r.image} sizes="280px" ratio={16 / 9} universe={r.universe} fallback={r.title} />
        </Link>
        <span className={styles.bar} aria-hidden="true" data-ui="progress">
          <span style={{ width: `${pct}%`, background: `var(--color-${r.universe})` }} />
        </span>
        <Link
          to={r.play}
          params={{ id: r.id }}
          className={styles.cardPlay}
          data-ui="card-play"
          style={{ background: `var(--color-${r.universe})`, color: `var(--color-${r.universe}-ink)` }}
          aria-label={t("home.resumeItem", { title: r.title })}
        >
          <Icon name="play" size={18} />
        </Link>
      </span>
      <Link to={r.link.to} params={{ id: r.link.id }} className={styles.cardTitle} data-ui="card-title">
        {r.title}
      </Link>
      {r.meta && (
        <span className={styles.muted} data-ui="card-meta">
          {r.meta}
        </span>
      )}
      <span className={styles.muted} data-ui="card-meta">
        {t("home.left", { time: formatRuntime(r.runtime - r.position) })}
      </span>
    </li>
  );
}

// --- Cards --------------------------------------------------------------------------------------

function EpisodeCard({ episode: e }: { episode: Episode }) {
  return (
    <li>
      <Link
        to="/episodes/$id"
        params={{ id: e.id }}
        className={styles.card}
        data-ui="card"
        data-kind="episode"
        data-universe="series"
      >
        <span className={styles.art}>
          <Artwork
            image={pickImage(e.images, ImageKind.THUMB, ImageKind.BACKDROP)}
            sizes="280px"
            ratio={16 / 9}
            universe="series"
            fallback={e.seriesTitle}
          />
          <span className={styles.chip} data-ui="badge">
            {episodeCode(e)}
          </span>
        </span>
        <span className={styles.cardTitle} data-ui="card-title">
          {e.seriesTitle}
        </span>
        <span className={styles.muted} data-ui="card-meta">
          {named(e.title, e.titleText)}
        </span>
      </Link>
    </li>
  );
}

/** Book: started, it opens in the reader; new, it shows on the bookshelf page. */
function BookItem({ book: b, reading }: { book: BookSummary; reading: boolean }) {
  const link: LinkProps = reading
    ? { to: "/play/book/$id", params: { id: b.id } }
    : { to: "/bookshelf", search: { book: b.id } };
  const meta = reading ? progressLabel(b.progress) : bookMeta(b);
  return (
    <li>
      <Link {...link} className={styles.card} data-ui="card" data-kind="book" data-universe="books">
        <span className={styles.art}>
          <Cover book={b} sizes="150px" />
        </span>
        <span className={styles.cardTitle} data-ui="card-title">
          {named(b.title, b.titleText)}
        </span>
        {meta && (
          <span className={styles.muted} data-ui="card-meta">
            {meta}
          </span>
        )}
      </Link>
    </li>
  );
}

/** Photo at its proportions, all at the same height. */
function PhotoTile({ photo: p }: { photo: PhotoSummary }) {
  const ratio = p.width > 0 && p.height > 0 ? Math.min(2, Math.max(0.6, p.width / p.height)) : 1;
  return (
    <li style={{ width: `${Math.round(photoHeight * ratio)}px` }}>
      <Link
        to="/play/photo/$id"
        params={{ id: p.id }}
        className={styles.art}
        data-ui="card"
        data-kind="photo"
        data-universe="photos"
      >
        <Artwork
          image={pickImage(p.images, ImageKind.PHOTO)}
          sizes={`${Math.round(photoHeight * ratio)}px`}
          ratio={ratio}
          universe="photos"
          shape="photo"
        />
        <span className={styles.srOnly}>{p.title}</span>
      </Link>
    </li>
  );
}

/** Height of the photos of the strip, in pixels. */
const photoHeight = 200;
