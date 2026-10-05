import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../../api/errors";
import { usePlaylistNext } from "../../../../features/lists/usePlaylistNext";
import { CatalogService } from "../../../../gen/laterna/v1/catalog_pb";
import { Player } from "../../../../player/Player";
import { validatePlaySearch } from "../../../../player/search";
import { Alert } from "../../../../ui/Alert";

export const Route = createFileRoute("/_app/play/movie/$id")({
  validateSearch: validatePlaySearch,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(CatalogService.method.getMovie, { movieId: params.id }, context),
    ),
  component: PlayMovie,
});

function PlayMovie() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { start, playlist, entry } = Route.useSearch();
  const query = useQuery(CatalogService.method.getMovie, { movieId: id });
  const inList = usePlaylistNext(playlist, entry);
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const m = query.data?.movie;
  if (!m) return null;
  return (
    <Player
      key={m.id}
      itemId={m.id}
      universe="movies"
      badge={t("catalog.movie")}
      title={m.title}
      subtitle={m.year ? String(m.year) : ""}
      files={query.data?.files ?? []}
      start={start}
      back={inList.back ?? { to: "/movies/$id", params: { id: m.id } }}
      next={inList.next}
    />
  );
}
