import { useInfiniteQuery, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { catalogLibrariesQuery } from "../../../api/queries";
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
import { AlbumCard, ArtistCard } from "../../../features/music/cards";
import styles from "../../../features/music/music.module.css";
import { TrackList } from "../../../features/music/TrackList";
import { CatalogService } from "../../../gen/laterna/v1/catalog_pb";
import { LibraryKind } from "../../../gen/laterna/v1/library_pb";
import { MusicService } from "../../../gen/laterna/v1/music_pb";
import { Alert } from "../../../ui/Alert";

const views = {
  albums: { label: "music.views.albums", sorts: ["added", "title", "released"] },
  artists: { label: "music.views.artists", sorts: ["added", "title"] },
  tracks: { label: "music.views.tracks", sorts: ["added", "title"] },
} as const satisfies Record<string, { label: string; sorts: readonly SortKey[] }>;
type View = keyof typeof views;

interface MusicSearch extends BrowseSearch {
  view?: Exclude<View, "albums">;
}

export const Route = createFileRoute("/_app/music/")({
  validateSearch: (search: Record<string, unknown>): MusicSearch => {
    const view = search.view === "artists" || search.view === "tracks" ? search.view : undefined;
    const browse = validateBrowseSearch(search);
    const allowed: readonly SortKey[] = views[view ?? "albums"].sorts;
    return {
      ...browse,
      view,
      sort: browse.sort && allowed.includes(browse.sort) ? browse.sort : undefined,
      genre: view ? undefined : browse.genre,
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogLibrariesQuery(context.transport)),
  component: Music,
});

function Music() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const view: View = search.view ?? "albums";
  const navigate = useNavigate({ from: Route.fullPath });
  const setSearch = (patch: Partial<BrowseSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const libraries = (useQuery(CatalogService.method.listCatalogLibraries, {}).data?.libraries ?? []).filter(
    (l) => l.kind === LibraryKind.MUSIC,
  );
  const selected = libraries.find((l) => l.id === search.library);
  const genres = useGenres(view === "albums" ? (selected ? [selected] : libraries).map((l) => l.id) : []);
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
  const albums = useInfiniteQuery(
    MusicService.method.listAlbums,
    { ...common, artistId: "", genre: search.genre ?? "", pageSize: 48 },
    { ...next, enabled: view === "albums" },
  );
  const artists = useInfiniteQuery(
    MusicService.method.listArtists,
    { ...common, pageSize: 48 },
    { ...next, enabled: view === "artists" },
  );
  const tracks = useInfiniteQuery(
    MusicService.method.listTracks,
    { ...common, pageSize: 100 },
    { ...next, enabled: view === "tracks" },
  );
  const query = view === "albums" ? albums : view === "artists" ? artists : tracks;
  const shown =
    view === "albums"
      ? (albums.data?.pages.flatMap((p) => p.albums) ?? [])
      : view === "artists"
        ? (artists.data?.pages.flatMap((p) => p.artists) ?? [])
        : (tracks.data?.pages.flatMap((p) => p.tracks) ?? []);
  const total = query.data?.pages[0]?.totalSize ?? 0;

  const counts = (selected ? [selected] : libraries).reduce(
    (n, l) => ({
      artists: n.artists + (l.counts?.artists ?? 0),
      albums: n.albums + (l.counts?.albums ?? 0),
      tracks: n.tracks + (l.counts?.tracks ?? 0),
    }),
    { artists: 0, albums: 0, tracks: 0 },
  );

  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  return (
    <Browse
      universe="music"
      title={t("nav.music")}
      subtitle={[
        t("music.artists", { count: counts.artists }),
        t("counts.albums", { count: counts.albums }),
        t("counts.tracks", { count: counts.tracks }),
      ].join(" · ")}
      tabs={
        <nav className={browseStyles.tabs} aria-label={t("music.view")}>
          {(Object.keys(views) as View[]).map((v) => (
            <Link
              key={v}
              to="/music"
              search={(prev) => ({
                library: prev.library,
                favorites: prev.favorites,
                view: v === "albums" ? undefined : v,
              })}
              className={browseStyles.tab}
              aria-current={v === view ? "page" : undefined}
              // The three tabs share the address: only an exact match of the parameters counts.
              activeOptions={{ exact: true, includeSearch: true }}
              replace
            >
              {t(views[v].label)}
            </Link>
          ))}
        </nav>
      }
      sortKeys={views[view].sorts}
      libraries={libraries}
      genres={genres}
      search={search}
      setSearch={setSearch}
      unwatchedFilter={false}
      total={query.isPending ? -1 : total}
      shown={shown.length}
      hasMore={Boolean(query.hasNextPage)}
      loadingMore={query.isFetchingNextPage || query.isPending}
      loadMore={() => query.fetchNextPage()}
    >
      {view === "albums" && (
        <PosterGrid>
          {(albums.data?.pages.flatMap((p) => p.albums) ?? []).map((a) => (
            <li key={a.id}>
              <AlbumCard album={a} />
            </li>
          ))}
        </PosterGrid>
      )}
      {view === "artists" && (
        <PosterGrid>
          {(artists.data?.pages.flatMap((p) => p.artists) ?? []).map((a) => (
            <li key={a.id}>
              <ArtistCard artist={a} />
            </li>
          ))}
        </PosterGrid>
      )}
      {view === "tracks" && (
        <div className={styles.panel}>
          <TrackList tracks={tracks.data?.pages.flatMap((p) => p.tracks) ?? []} />
        </div>
      )}
    </Browse>
  );
}
