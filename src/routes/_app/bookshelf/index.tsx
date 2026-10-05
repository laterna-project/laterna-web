import { useInfiniteQuery, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { ImageKind, pickImage } from "../../../api/media";
import { catalogLibrariesQuery } from "../../../api/queries";
import { progressLabel } from "../../../books/logic";
import { BookPanel } from "../../../features/books/BookPanel";
import styles from "../../../features/books/books.module.css";
import { BookCard, bookMeta, SeriesCard } from "../../../features/books/cards";
import {
  Browse,
  type BrowseSearch,
  PosterGrid,
  type SortKey,
  sorts,
  validateBrowseSearch,
} from "../../../features/catalog/Browse";
import browseStyles from "../../../features/catalog/browse.module.css";
import { useGenres } from "../../../features/catalog/useGenres";
import { rowTitle } from "../../../features/home/rows";
import { BookService } from "../../../gen/laterna/v1/book_pb";
import { CatalogService } from "../../../gen/laterna/v1/catalog_pb";
import { HomeRowKind, HomeService } from "../../../gen/laterna/v1/home_pb";
import { LibraryKind } from "../../../gen/laterna/v1/library_pb";
import { Alert } from "../../../ui/Alert";
import { Artwork } from "../../../ui/Artwork";

const bookSorts: readonly SortKey[] = ["added", "title", "released"];

interface BooksSearch extends BrowseSearch {
  view?: "series";
  /** Book shown in the panel. */
  book?: string;
}

export const Route = createFileRoute("/_app/bookshelf/")({
  validateSearch: (search: Record<string, unknown>): BooksSearch => {
    const browse = validateBrowseSearch(search);
    const view = search.view === "series" ? "series" : undefined;
    return {
      ...browse,
      view,
      sort: browse.sort && bookSorts.includes(browse.sort) ? browse.sort : undefined,
      genre: view ? undefined : browse.genre,
      unwatched: view ? undefined : browse.unwatched,
      book: typeof search.book === "string" && search.book ? search.book : undefined,
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogLibrariesQuery(context.transport)),
  component: Books,
});

function Books() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const series = search.view === "series";
  const navigate = useNavigate({ from: Route.fullPath });
  const setSearch = (patch: Partial<BrowseSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const libraries = (useQuery(CatalogService.method.listCatalogLibraries, {}).data?.libraries ?? []).filter(
    (l) => l.kind === LibraryKind.BOOKS,
  );
  const selected = libraries.find((l) => l.id === search.library);
  const genres = useGenres(series ? [] : (selected ? [selected] : libraries).map((l) => l.id));
  const common = {
    libraryId: selected?.id ?? "",
    sort: sorts[search.sort ?? "added"].sort,
    reverse: Boolean(search.reverse),
    favoritesOnly: Boolean(search.favorites),
    pageToken: "",
  };
  const next = {
    pageParamKey: "pageToken",
    getNextPageParam: (last: { nextPageToken: string }) => last.nextPageToken || undefined,
  } as const;
  const books = useInfiniteQuery(
    BookService.method.listBooks,
    {
      ...common,
      seriesId: "",
      genre: search.genre ?? "",
      read: search.unwatched ? false : undefined,
      pageSize: 48,
    },
    next,
  );
  const allSeries = useInfiniteQuery(BookService.method.listBookSeries, { ...common, pageSize: 48 }, next);
  // "Continue reading": the home row, decided by the server.
  const home = useQuery(HomeService.method.getHome, { rowSize: 12 });
  const reading = home.data?.rows.find((r) => r.kind === HomeRowKind.READING);
  const readingBooks = (reading?.items ?? []).flatMap((i) => (i.item.case === "book" ? [i.item.value] : []));

  const query = series ? allSeries : books;
  const bookList = books.data?.pages.flatMap((p) => p.books) ?? [];
  const seriesList = allSeries.data?.pages.flatMap((p) => p.series) ?? [];
  const total = query.data?.pages[0]?.totalSize ?? 0;
  const shown = series ? seriesList.length : bookList.length;
  const chosen = search.book ?? readingBooks[0]?.id ?? bookList[0]?.id;
  const nBooks = books.data?.pages[0]?.totalSize ?? 0;
  const nSeries = allSeries.data?.pages[0]?.totalSize ?? 0;

  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  return (
    <Browse
      universe="books"
      title={t("nav.books")}
      subtitle={t("books.listSubtitle", {
        books: t("counts.books", { count: nBooks }),
        series: t("books.seriesCount", { count: nSeries }),
      })}
      tabs={
        <nav className={browseStyles.tabs} aria-label={t("music.view")}>
          {(
            [
              [undefined, "books.tabs.books"],
              ["series", "books.tabs.series"],
            ] as const
          ).map(([view, label]) => (
            <Link
              key={label}
              to="/bookshelf"
              search={(prev) => ({ library: prev.library, favorites: prev.favorites, view })}
              className={browseStyles.tab}
              aria-current={search.view === view ? "page" : undefined}
              activeOptions={{ exact: true, includeSearch: true }}
              replace
            >
              {t(label)}
            </Link>
          ))}
        </nav>
      }
      intro={
        !series && readingBooks.length > 0 ? (
          <section className={styles.continue} aria-labelledby="continue">
            <h2 id="continue" className={styles.sectionTitle}>
              {reading ? rowTitle(reading) : ""}
            </h2>
            <ul className={styles.continueList}>
              {readingBooks.slice(0, 3).map((b) => (
                <li key={b.id}>
                  <Link to="/play/book/$id" params={{ id: b.id }} className={styles.continueItem}>
                    <Artwork
                      image={pickImage(b.images, ImageKind.POSTER)}
                      sizes="64px"
                      ratio={2 / 3}
                      universe="books"
                      fallback={b.title}
                      shape="cover"
                      className={styles.continueArt}
                    />
                    <span className={styles.continueText}>
                      <span className={styles.title}>{b.title}</span>
                      <span className={styles.meta}>{bookMeta(b)}</span>
                      <span className={styles.bar}>
                        <span style={{ width: `${(b.progress?.progression ?? 0) * 100}%` }} />
                      </span>
                      <span className={styles.small}>{progressLabel(b.progress)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
      aside={!series && chosen ? <BookPanel key={chosen} bookId={chosen} /> : undefined}
      sortKeys={bookSorts}
      libraries={libraries}
      genres={genres}
      search={search}
      setSearch={setSearch}
      unwatchedFilter={!series}
      unwatchedLabel={t("books.unread")}
      total={query.isPending ? -1 : total}
      shown={shown}
      hasMore={Boolean(query.hasNextPage)}
      loadingMore={query.isFetchingNextPage || query.isPending}
      loadMore={() => query.fetchNextPage()}
    >
      <PosterGrid>
        {series
          ? seriesList.map((s) => (
              <li key={s.id}>
                <SeriesCard series={s} />
              </li>
            ))
          : bookList.map((b) => (
              <li key={b.id}>
                <BookCard
                  book={b}
                  selected={b.id === chosen}
                  link={{ to: "/bookshelf", search: { ...search, book: b.id } }}
                />
              </li>
            ))}
      </PosterGrid>
    </Browse>
  );
}
