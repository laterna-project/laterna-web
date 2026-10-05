import { useMutation } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { ImageKind, pickImage } from "../../api/media";
import { named } from "../../api/text";
import { type AlbumSummary, type ArtistSummary, CatalogService } from "../../gen/laterna/v1/catalog_pb";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import { useRefreshCatalog } from "../catalog/actions";
import styles from "./music.module.css";
import { usePlay } from "./usePlay";

export function albumMeta(a: { artistName: string; year: number }): string {
  return [a.artistName, a.year || null].filter(Boolean).join(" · ");
}

/** Clickable album cover, with a button to play it right away. */
export function AlbumCard({ album: a, meta = albumMeta(a) }: { album: AlbumSummary; meta?: string }) {
  const { t } = useTranslation();
  const play = usePlay();
  return (
    <div className={styles.card} data-ui="card" data-kind="album" data-universe="music">
      <span className={styles.cardArt}>
        <Link to="/music/albums/$id" params={{ id: a.id }} tabIndex={-1} aria-hidden="true">
          <Artwork
            image={pickImage(a.images, ImageKind.POSTER)}
            sizes="(max-width: 767px) 45vw, 200px"
            ratio={1}
            universe="music"
            fallback={named(a.title, a.titleText)}
            shape="disc"
          />
        </Link>
        <button
          type="button"
          className={styles.cardPlay}
          data-ui="card-play"
          onClick={() => void play.album(a.id)}
          aria-label={t("music.listen", { title: a.title })}
        >
          <Icon name="play" size={18} />
        </button>
        {a.userData?.favorite && (
          <span className={styles.cardFavorite} role="img" aria-label={t("catalog.favorite")} data-ui="badge">
            <Icon name="heart" size={12} filled />
          </span>
        )}
      </span>
      <Link to="/music/albums/$id" params={{ id: a.id }} className={styles.cardTitle} data-ui="card-title">
        {named(a.title, a.titleText)}
      </Link>
      <span className={styles.cardMeta} data-ui="card-meta">
        {meta}
      </span>
    </div>
  );
}

export function ArtistCard({ artist: a }: { artist: ArtistSummary }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/music/artists/$id"
      params={{ id: a.id }}
      className={styles.artistCard}
      data-ui="card"
      data-kind="artist"
      data-universe="music"
    >
      <Artwork
        image={pickImage(a.images, ImageKind.POSTER, ImageKind.THUMB)}
        sizes="(max-width: 767px) 45vw, 200px"
        ratio={1}
        universe="music"
        fallback={named(a.name, a.nameText)}
        shape="round"
      />
      <span className={styles.cardTitle} data-ui="card-title">
        {named(a.name, a.nameText)}
      </span>
      <span className={styles.cardMeta} data-ui="card-meta">
        {t("counts.albums", { count: a.albumCount })} · {t("counts.tracks", { count: a.trackCount })}
      </span>
    </Link>
  );
}

/** Round "favorite" button of album and artist headers. */
export function FavoriteRound({
  itemId,
  favorite,
  label,
}: {
  itemId: string;
  favorite: boolean;
  label: string;
}) {
  const refresh = useRefreshCatalog();
  const mutation = useMutation(CatalogService.method.setFavorite, { onSuccess: refresh });
  return (
    <button
      type="button"
      className={styles.roundAction}
      aria-pressed={favorite}
      aria-label={label}
      title={mutation.isError ? errorMessage(mutation.error) : label}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ itemId, favorite: !favorite })}
    >
      <Icon name="heart" size={20} filled={favorite} />
    </button>
  );
}
