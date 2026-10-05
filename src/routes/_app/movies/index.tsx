import { useInfiniteQuery, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { catalogLibrariesQuery } from "../../../api/queries";
import {
  Browse,
  type BrowseSearch,
  PosterGrid,
  sorts,
  validateBrowseSearch,
} from "../../../features/catalog/Browse";
import { MovieCard } from "../../../features/catalog/cards";
import { useGenres } from "../../../features/catalog/useGenres";
import { CatalogService } from "../../../gen/laterna/v1/catalog_pb";
import { LibraryKind } from "../../../gen/laterna/v1/library_pb";
import { Alert } from "../../../ui/Alert";

export const Route = createFileRoute("/_app/movies/")({
  validateSearch: validateBrowseSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogLibrariesQuery(context.transport)),
  component: Films,
});

function Films() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setSearch = (patch: Partial<BrowseSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const libraries = (useQuery(CatalogService.method.listCatalogLibraries, {}).data?.libraries ?? []).filter(
    (l) => l.kind === LibraryKind.MOVIES,
  );
  const selected = libraries.find((l) => l.id === search.library);
  const genres = useGenres((selected ? [selected] : libraries).map((l) => l.id));

  const movies = useInfiniteQuery(
    CatalogService.method.listMovies,
    {
      libraryId: selected?.id ?? "",
      sort: sorts[search.sort ?? "added"].sort,
      reverse: Boolean(search.reverse),
      genre: search.genre ?? "",
      played: search.unwatched ? false : undefined,
      favoritesOnly: Boolean(search.favorites),
      pageSize: 48,
      pageToken: "",
    },
    { pageParamKey: "pageToken", getNextPageParam: (last) => last.nextPageToken || undefined },
  );
  const list = movies.data?.pages.flatMap((p) => p.movies) ?? [];
  const total = movies.data?.pages[0]?.totalSize ?? 0;
  const count = (selected ? [selected] : libraries).reduce((n, l) => n + (l.counts?.movies ?? 0), 0);

  if (movies.isError) return <Alert>{errorMessage(movies.error)}</Alert>;
  return (
    <Browse
      universe="movies"
      title={t("nav.movies")}
      subtitle={
        libraries.length > 1
          ? t("catalog.inLibraries", { titles: t("catalog.titles", { count }), n: libraries.length })
          : t("catalog.titles", { count })
      }
      libraries={libraries}
      genres={genres}
      search={search}
      setSearch={setSearch}
      unwatchedFilter
      total={movies.isPending ? -1 : total}
      shown={list.length}
      hasMore={Boolean(movies.hasNextPage)}
      loadingMore={movies.isFetchingNextPage || movies.isPending}
      loadMore={() => movies.fetchNextPage()}
    >
      <PosterGrid>
        {list.map((m) => (
          <li key={m.id}>
            <MovieCard movie={m} />
          </li>
        ))}
      </PosterGrid>
    </Browse>
  );
}
