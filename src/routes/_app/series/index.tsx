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
import { SeriesCard } from "../../../features/catalog/cards";
import { useGenres } from "../../../features/catalog/useGenres";
import { CatalogService } from "../../../gen/laterna/v1/catalog_pb";
import { LibraryKind } from "../../../gen/laterna/v1/library_pb";
import { Alert } from "../../../ui/Alert";

export const Route = createFileRoute("/_app/series/")({
  validateSearch: validateBrowseSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogLibrariesQuery(context.transport)),
  component: SeriesList,
});

function SeriesList() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setSearch = (patch: Partial<BrowseSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const libraries = (useQuery(CatalogService.method.listCatalogLibraries, {}).data?.libraries ?? []).filter(
    (l) => l.kind === LibraryKind.SHOWS,
  );
  const selected = libraries.find((l) => l.id === search.library);
  const genres = useGenres((selected ? [selected] : libraries).map((l) => l.id));

  const series = useInfiniteQuery(
    CatalogService.method.listSeries,
    {
      libraryId: selected?.id ?? "",
      sort: sorts[search.sort ?? "added"].sort,
      reverse: Boolean(search.reverse),
      genre: search.genre ?? "",
      favoritesOnly: Boolean(search.favorites),
      pageSize: 48,
      pageToken: "",
    },
    { pageParamKey: "pageToken", getNextPageParam: (last) => last.nextPageToken || undefined },
  );
  const list = series.data?.pages.flatMap((p) => p.series) ?? [];
  const total = series.data?.pages[0]?.totalSize ?? 0;
  const inScope = selected ? [selected] : libraries;
  const count = inScope.reduce((n, l) => n + (l.counts?.series ?? 0), 0);
  const episodes = inScope.reduce((n, l) => n + (l.counts?.episodes ?? 0), 0);

  if (series.isError) return <Alert>{errorMessage(series.error)}</Alert>;
  return (
    <Browse
      universe="series"
      title={t("nav.series")}
      subtitle={`${t("catalog.seriesCount", { count })} · ${t("catalog.episodes", { count: episodes })}`}
      libraries={libraries}
      genres={genres}
      search={search}
      setSearch={setSearch}
      unwatchedFilter={false}
      total={series.isPending ? -1 : total}
      shown={list.length}
      hasMore={Boolean(series.hasNextPage)}
      loadingMore={series.isFetchingNextPage || series.isPending}
      loadMore={() => series.fetchNextPage()}
    >
      <PosterGrid>
        {list.map((s) => (
          <li key={s.id}>
            <SeriesCard series={s} />
          </li>
        ))}
      </PosterGrid>
    </Browse>
  );
}
