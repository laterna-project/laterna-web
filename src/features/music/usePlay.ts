import { createQueryOptions, useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { MusicService } from "../../gen/laterna/v1/music_pb";
import { useMusic } from "../../music/MusicProvider";

/**
 * Play an album or an artist from anywhere (card, search result): the tracks are fetched (or taken
 * from the cache), then handed to the player.
 */
export function usePlay() {
  const music = useMusic();
  const queryClient = useQueryClient();
  const transport = useTransport();

  const album = useCallback(
    async (albumId: string, options: { shuffled?: boolean; trackId?: string } = {}) => {
      const { tracks } = await queryClient.fetchQuery(
        createQueryOptions(MusicService.method.getAlbum, { albumId }, { transport }),
      );
      const at = options.trackId ? tracks.findIndex((t) => t.id === options.trackId) : 0;
      music.play(tracks, Math.max(0, at), { shuffled: options.shuffled });
    },
    [music, queryClient, transport],
  );

  const artist = useCallback(
    async (artistId: string, options: { shuffled?: boolean } = {}) => {
      const { tracks } = await queryClient.fetchQuery(
        createQueryOptions(MusicService.method.listArtistTracks, { artistId }, { transport }),
      );
      music.play(tracks, 0, { shuffled: options.shuffled });
    },
    [music, queryClient, transport],
  );

  return { album, artist };
}
