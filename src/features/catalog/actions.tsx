import { useMutation } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { formatClock } from "../../api/media";
import { BookService } from "../../gen/laterna/v1/book_pb";
import { CatalogService, type MediaFile } from "../../gen/laterna/v1/catalog_pb";
import { HomeService } from "../../gen/laterna/v1/home_pb";
import { MusicService } from "../../gen/laterna/v1/music_pb";
import { PhotoService } from "../../gen/laterna/v1/photo_pb";
import { StartParty } from "../../party/StartParty";
import type { Universe } from "../../theme/contract";
import { Icon } from "../../ui/Icon";
import { DownloadButton } from "../downloads/DownloadButton";
import { AddToPlaylist } from "../lists/AddToPlaylist";
import styles from "./actions.module.css";

/** Refetches the catalog (movies, music, books, photos) and home after a change made here. */
export function useRefreshCatalog() {
  const invalidate = useInvalidate();
  return () => invalidate(CatalogService, HomeService, MusicService, BookService, PhotoService);
}

/** Marks watched or unwatched (a series or a season: all its episodes). */
export function PlayedButton({
  itemId,
  played,
  label,
}: {
  itemId: string;
  played: boolean;
  /** "Watched" by default. */
  label?: string;
}) {
  const { t } = useTranslation();
  const refresh = useRefreshCatalog();
  const mutation = useMutation(CatalogService.method.setPlayed, { onSuccess: refresh });
  return (
    <button
      type="button"
      className={styles.action}
      aria-pressed={played}
      disabled={mutation.isPending}
      title={mutation.isError ? errorMessage(mutation.error) : undefined}
      onClick={() => mutation.mutate({ itemId, played: !played })}
    >
      <span className={styles.icon}>
        <Icon name="check" />
      </span>
      {label ?? t("actions.watched")}
    </button>
  );
}

export function FavoriteButton({ itemId, favorite }: { itemId: string; favorite: boolean }) {
  const { t } = useTranslation();
  const refresh = useRefreshCatalog();
  const mutation = useMutation(CatalogService.method.setFavorite, { onSuccess: refresh });
  return (
    <button
      type="button"
      className={styles.action}
      aria-pressed={favorite}
      disabled={mutation.isPending}
      title={mutation.isError ? errorMessage(mutation.error) : undefined}
      onClick={() => mutation.mutate({ itemId, favorite: !favorite })}
    >
      <span className={`${styles.icon} ${styles.heart}`}>
        <Icon name="heart" filled={favorite} />
      </span>
      {t("actions.favorite")}
    </button>
  );
}

/** Discreet "Mark all watched" button of a season, or "read" of a book series. */
export function MarkAllButton({
  itemId,
  played,
  word = "watched",
}: {
  itemId: string;
  played: boolean;
  /** "watched" for a season, "read" for a book series. */
  word?: "watched" | "read";
}) {
  const { t } = useTranslation();
  const refresh = useRefreshCatalog();
  const mutation = useMutation(CatalogService.method.setPlayed, { onSuccess: refresh });
  return (
    <button
      type="button"
      className={styles.quiet}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ itemId, played: !played })}
    >
      {word === "read"
        ? t(played ? "actions.markAllUnread" : "actions.markAllRead")
        : t(played ? "actions.markAllUnwatched" : "actions.markAllWatched")}
    </button>
  );
}

/**
 * Playing a movie or an episode: "Play", or "Resume" where the profile stopped, with "From the
 * beginning" next to it.
 */
export function PlayButtons({
  kind,
  id,
  universe,
  position,
  label,
}: {
  kind: "film" | "episode";
  id: string;
  universe: Universe;
  /** The profile's resume position, in seconds (0: nothing started). */
  position: number;
  /** Detail under the verb, "S1 · E3" for a series. */
  label?: string;
}) {
  const { t } = useTranslation();
  const to = kind === "film" ? "/play/movie/$id" : "/play/episode/$id";
  return (
    <>
      <Link
        to={to}
        params={{ id }}
        className={styles.play}
        style={{ background: `var(--color-${universe})`, color: `var(--color-${universe}-ink)` }}
      >
        <Icon name="play" />
        {position > 0 ? t("actions.resume") : t("actions.play")}
        {(label || position > 0) && <small>{label ?? formatClock(position)}</small>}
      </Link>
      {position > 0 && (
        <Link to={to} params={{ id }} search={{ start: 0 }} className={`${styles.action} ${styles.restart}`}>
          {t("actions.fromStart")}
        </Link>
      )}
    </>
  );
}

/** "Add to a playlist" on detail pages (movie, series: its episodes, episode). */
export function ListButton({ itemId, what }: { itemId: string; what: string }) {
  const { t } = useTranslation();
  return (
    <AddToPlaylist itemIds={[itemId]} what={what} className={styles.action}>
      <span className={styles.icon}>
        <Icon name="listAdd" />
      </span>
      {t("actions.list")}
    </AddToPlaylist>
  );
}

/**
 * "Watch together" on detail pages: a watch party with this movie, this series (its episodes), this
 * episode.
 */
export function PartyButton({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  return (
    <StartParty itemIds={[itemId]} className={styles.action}>
      <span className={styles.icon}>
        <Icon name="people" />
      </span>
      {t("actions.together")}
    </StartParty>
  );
}

/** "Download" on detail pages: this movie, this series (its episodes), this episode. */
export function DownloadAction({
  itemId,
  what,
  files,
}: {
  itemId: string;
  what: string;
  /** Files of a movie or an episode: version and audio track to choose from. */
  files?: readonly MediaFile[];
}) {
  const { t } = useTranslation();
  return (
    <DownloadButton itemIds={[itemId]} what={what} files={files} className={styles.action}>
      <span className={styles.icon}>
        <Icon name="download" />
      </span>
      {t("actions.download")}
    </DownloadButton>
  );
}
