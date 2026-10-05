import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { errorMessage } from "../../../../api/errors";
import { ImageKind, pickImage } from "../../../../api/media";
import { named } from "../../../../api/text";
import { episodeCode } from "../../../../features/catalog/format";
import { usePlaylistNext } from "../../../../features/lists/usePlaylistNext";
import { CatalogService } from "../../../../gen/laterna/v1/catalog_pb";
import { nextEpisode } from "../../../../player/logic";
import { Player } from "../../../../player/Player";
import { validatePlaySearch } from "../../../../player/search";
import { Alert } from "../../../../ui/Alert";

export const Route = createFileRoute("/_app/play/episode/$id")({
  validateSearch: validatePlaySearch,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(CatalogService.method.getEpisode, { episodeId: params.id }, context),
    ),
  component: PlayEpisode,
});

function PlayEpisode() {
  const { id } = Route.useParams();
  const { start, playlist, entry } = Route.useSearch();
  const query = useQuery(CatalogService.method.getEpisode, { episodeId: id });
  const inList = usePlaylistNext(playlist, entry);
  const e = query.data?.episode;
  // The whole series, in order: the next episode may open the following season.
  const episodes = useQuery(
    CatalogService.method.listEpisodes,
    { seriesId: e?.seriesId ?? "", seasonId: "" },
    { enabled: Boolean(e) },
  );
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  if (!e) return null;
  const next = nextEpisode(episodes.data?.episodes ?? [], e.id);
  return (
    <Player
      key={e.id}
      itemId={e.id}
      universe="series"
      badge={episodeCode(e)}
      title={named(e.title, e.titleText)}
      subtitle={e.seriesTitle}
      files={query.data?.files ?? []}
      start={start}
      back={inList.back ?? { to: "/episodes/$id", params: { id: e.id } }}
      episodes={(episodes.data?.episodes ?? []).map((x) => ({
        id: x.id,
        label: episodeCode(x),
        title: named(x.title, x.titleText),
      }))}
      next={
        // From a playlist, what comes next is the playlist's; otherwise the next episode.
        playlist
          ? inList.next
          : next && {
              title: `${episodeCode(next)} · ${named(next.title, next.titleText)}`,
              link: { to: "/play/episode/$id", params: { id: next.id } },
              image: pickImage(next.images, ImageKind.THUMB, ImageKind.BACKDROP),
            }
      }
    />
  );
}
