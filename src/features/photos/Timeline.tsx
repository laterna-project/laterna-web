import { createClient } from "@connectrpc/connect";
import { useQuery, useTransport } from "@connectrpc/connect-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInvalidate } from "../../api/invalidate";
import { ImageKind, pickImage } from "../../api/media";
import { CatalogService, type PhotoAlbum, type PhotoSummary } from "../../gen/laterna/v1/catalog_pb";
import { HomeService } from "../../gen/laterna/v1/home_pb";
import { PhotoService } from "../../gen/laterna/v1/photo_pb";
import { type PhotoContext, saveSelection } from "../../photos/context";
import { groupByDay } from "../../photos/logic";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import { JustifiedGrid, type Selection } from "./JustifiedGrid";
import styles from "./photos.module.css";

/** Selection of photos on a page: a set of identifiers. */
export function useSelection(): Selection & { clear: () => void } {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  return {
    ids,
    toggle: (id) =>
      setIds((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    clear: () => setIds(new Set()),
  };
}

/** Timeline: one group per day, its album if there is only one, its slideshow. */
export function Timeline({
  photos,
  context,
  selection,
}: {
  photos: readonly PhotoSummary[];
  context: PhotoContext;
  selection: Selection;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupByDay(photos), [photos]);
  const navigate = useNavigate();
  return (
    <div className={styles.timeline}>
      {groups.map((g) => {
        const albums = new Set(g.photos.map((p) => p.albumId));
        const album = albums.size === 1 ? g.photos[0]?.albumId : undefined;
        return (
          <section
            key={g.key}
            id={`day-${g.key}`}
            className={styles.day}
            aria-labelledby={`title-${g.key}`}
            data-ui="photo-day"
          >
            <div className={styles.dayHead}>
              <h2 id={`title-${g.key}`} className={styles.dayTitle}>
                {g.label}
              </h2>
              <span className={styles.muted}>{t("counts.photos", { count: g.photos.length })}</span>
              {album && !context.album && <AlbumLink id={album} />}
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.small}
                onClick={() =>
                  void navigate({
                    to: "/play/photo/$id",
                    params: { id: g.photos[0]?.id ?? "" },
                    search: { ...context, slideshow: true },
                  })
                }
              >
                {t("photos.slideshow")}
              </button>
            </div>
            <JustifiedGrid photos={g.photos} context={context} selection={selection} />
          </section>
        );
      })}
    </div>
  );
}

function AlbumLink({ id }: { id: string }) {
  const album = useQuery(PhotoService.method.getPhotoAlbum, { albumId: id }).data?.album;
  if (!album) return null;
  return (
    <Link to="/photos/albums/$id" params={{ id }} className={styles.albumLink}>
      {album.title}
    </Link>
  );
}

/** Selection bar: slideshow, favorites, clear the selection. */
export function SelectionBar({
  photos,
  selection,
}: {
  photos: readonly PhotoSummary[];
  selection: Selection & { clear: () => void };
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const transport = useTransport();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const chosen = photos.filter((p) => selection.ids.has(p.id));
  if (chosen.length === 0) return null;
  const allFavorite = chosen.every((p) => p.userData?.favorite);

  const setFavorite = async () => {
    setBusy(true);
    const catalog = createClient(CatalogService, transport);
    try {
      await Promise.all(chosen.map((p) => catalog.setFavorite({ itemId: p.id, favorite: !allFavorite })));
    } finally {
      await invalidate(PhotoService, HomeService);
      setBusy(false);
    }
  };

  return (
    <div className={styles.selectionBar} role="toolbar" aria-label={t("photos.chosen")}>
      <span className={styles.selectionCount}>{t("photos.selected", { count: chosen.length })}</span>
      <button
        type="button"
        className={styles.barPrimary}
        onClick={() => {
          saveSelection(chosen.map((p) => p.id));
          void navigate({
            to: "/play/photo/$id",
            params: { id: chosen[0]?.id ?? "" },
            search: { selection: true, slideshow: true },
          });
        }}
      >
        {t("photos.slideshow")}
      </button>
      <button type="button" className={styles.barButton} onClick={() => void setFavorite()} disabled={busy}>
        {allFavorite ? t("photos.removeFavorite") : t("photos.addFavorite")}
      </button>
      <button
        type="button"
        className={styles.barClose}
        onClick={selection.clear}
        aria-label={t("photos.unselectAll")}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

export function AlbumCard({ album: a }: { album: PhotoAlbum }) {
  const { t } = useTranslation();
  const parts = [
    a.photoCount ? t("counts.photos", { count: a.photoCount }) : "",
    a.albumCount ? t("counts.albums", { count: a.albumCount }) : "",
  ].filter(Boolean);
  return (
    <Link to="/photos/albums/$id" params={{ id: a.id }} className={styles.albumCard}>
      <span className={styles.albumArt}>
        <Artwork
          image={pickImage(a.images, ImageKind.POSTER, ImageKind.PHOTO)}
          sizes="(max-width: 767px) 50vw, 280px"
          ratio={4 / 3}
          universe="photos"
          fallback={a.title}
          shape="photo"
        />
        {a.userData?.favorite && (
          <span className={styles.favorite} role="img" aria-label={t("catalog.favorite")}>
            <Icon name="heart" size={12} filled />
          </span>
        )}
      </span>
      <span className={styles.albumTitle}>{a.title}</span>
      <span className={styles.muted}>{parts.join(" · ") || t("photos.emptyAlbum")}</span>
    </Link>
  );
}
