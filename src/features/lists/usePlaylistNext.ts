import { useQuery } from "@connectrpc/connect-query";
import type { LinkProps } from "@tanstack/react-router";
import { PlaylistService } from "../../gen/laterna/v1/playlist_pb";
import i18n from "../../i18n";
import { entryView, nextVideo } from "./entries";

/**
 * Playback started from a playlist: the playlist's next video (the player continues with it), and
 * the way back to the playlist. Nothing outside a playlist.
 */
export function usePlaylistNext(
  playlist: string | undefined,
  entry: string | undefined,
): { next?: { title: string; link: LinkProps; label: string }; back?: LinkProps; name?: string } {
  const query = useQuery(
    PlaylistService.method.getPlaylist,
    { playlistId: playlist ?? "" },
    { enabled: Boolean(playlist) },
  );
  if (!playlist || !entry) return {};
  const back: LinkProps = { to: "/playlists", search: { playlist } };
  const following = nextVideo(query.data?.entries ?? [], entry);
  const view = following && entryView(following);
  if (!following || !view) return { back, name: query.data?.playlist?.name };
  const search = { playlist, entry: following.id };
  const link: LinkProps =
    following.item.case === "movie"
      ? { to: "/play/movie/$id", params: { id: following.item.value.id }, search }
      : { to: "/play/episode/$id", params: { id: following.item.value?.id ?? "" }, search };
  return {
    back,
    name: query.data?.playlist?.name,
    next: { title: view.title, link, label: i18n.t("lists.nextInList") },
  };
}
