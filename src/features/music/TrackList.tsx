import { useMutation } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { formatClock, ImageKind, pickImage, seconds } from "../../api/media";
import { CatalogService, type Track } from "../../gen/laterna/v1/catalog_pb";
import { Bars } from "../../music/MiniPlayer";
import { useMusic } from "../../music/MusicProvider";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import { useRefreshCatalog } from "../catalog/actions";
import { AddToPlaylist } from "../lists/AddToPlaylist";
import styles from "./music.module.css";
import { TrackInfoButton } from "./TrackInfo";

/**
 * List of tracks: a click plays the list from that track. album: the album's numbers and separate
 * discs; otherwise order numbers, and each track's cover and album.
 */
export function TrackList({ tracks, album = false }: { tracks: readonly Track[]; album?: boolean }) {
  const { t: tr } = useTranslation();
  const music = useMusic();
  const discs = new Set(tracks.map((t) => t.disc)).size > 1;
  return (
    <ol className={styles.tracks} data-ui="track-list">
      {tracks.map((t, i) => {
        const on = music.current?.id === t.id;
        const newDisc = album && discs && t.disc !== tracks[i - 1]?.disc;
        return (
          <Fragment key={t.id}>
            {newDisc && <li className={styles.disc}>{tr("music.disc", { n: t.disc || "?" })}</li>}
            <li className={styles.track} aria-current={on ? "true" : undefined} data-ui="track">
              <button type="button" className={styles.trackMain} onClick={() => music.play(tracks, i)}>
                <span className={styles.trackNumber}>
                  {on ? <Bars playing={music.playing} /> : album ? t.number || i + 1 : i + 1}
                </span>
                {!album && (
                  <Artwork
                    image={pickImage(t.images, ImageKind.POSTER)}
                    sizes="40px"
                    ratio={1}
                    universe="music"
                    fallback={t.albumTitle}
                    shape="disc"
                    className={styles.trackArt}
                  />
                )}
                <span className={styles.trackText}>
                  <span className={styles.trackTitle}>{t.title}</span>
                  {(!album || (t.artists && t.artists !== t.artistName)) && (
                    <span className={styles.trackSub}>
                      {[t.artists || t.artistName, album ? "" : t.albumTitle].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </button>
              <FavoriteTrack track={t} />
              <span className={styles.trackTime}>{formatClock(seconds(t.runtime))}</span>
              <span className={styles.trackActions}>
                <button
                  type="button"
                  className={styles.trackAction}
                  onClick={() => music.playNext([t])}
                  aria-label={tr("music.playNextLabel", { title: t.title })}
                  title={tr("music.playNext")}
                >
                  <Icon name="skipForward" size={14} />
                </button>
                <button
                  type="button"
                  className={styles.trackAction}
                  onClick={() => music.append([t])}
                  aria-label={tr("music.addToQueueLabel", { title: t.title })}
                  title={tr("music.addToQueue")}
                >
                  <Icon name="queueAdd" size={16} />
                </button>
                <TrackInfoButton track={t} className={styles.trackAction} />
                <AddToPlaylist itemIds={[t.id]} what={tr("what.track")} className={styles.trackAction}>
                  <Icon name="listAdd" size={16} />
                </AddToPlaylist>
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function FavoriteTrack({ track: t }: { track: Track }) {
  const { t: tr } = useTranslation();
  const refresh = useRefreshCatalog();
  const mutation = useMutation(CatalogService.method.setFavorite, { onSuccess: refresh });
  const on = Boolean(t.userData?.favorite);
  return (
    <button
      type="button"
      className={styles.trackFavorite}
      aria-pressed={on}
      aria-label={tr("music.favoriteLabel", { title: t.title })}
      title={mutation.isError ? errorMessage(mutation.error) : undefined}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ itemId: t.id, favorite: !on })}
    >
      <Icon name="heart" size={16} filled={on} />
    </button>
  );
}

/** Link to an artist, with its initial in a badge. */
export function ArtistLink({ id, name }: { id: string; name: string }) {
  return (
    <Link to="/music/artists/$id" params={{ id }} className={styles.artistLink}>
      <span className={styles.artistInitial} aria-hidden="true">
        {name.slice(0, 1)}
      </span>
      {name}
    </Link>
  );
}
