import {
  createQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { useQueries } from "@tanstack/react-query";
import { Link, type LinkProps, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../api/errors";
import { ImageKind, imageSrcSet, imageUrl, imageWidthFor, pickImage } from "../api/media";
import { useRefreshCatalog } from "../features/catalog/actions";
import { CatalogService, type PhotoSummary } from "../gen/laterna/v1/catalog_pb";
import { PhotoService } from "../gen/laterna/v1/photo_pb";
import { Icon } from "../ui/Icon";
import { usePanelFocus } from "../ui/usePanelFocus";
import { listInput, loadSelection, type ViewerSearch } from "./context";
import { coordinates, dayLabel, exifLines, mapUrl, timeLabel } from "./logic";
import styles from "./viewer.module.css";

const slideshowDelay = 5000;

/** Photo viewer: one photo, large, its information, what comes next. */
export function PhotoViewer({ id, search }: { id: string; search: ViewerSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const transport = useTransport();
  const stage = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState(false);
  const infoRef = usePanelFocus<HTMLElement>(info, () => setInfo(false));
  const [idle, setIdle] = useState(false);
  const playing = Boolean(search.slideshow);

  // The sequence: the selection (kept for the tab), otherwise the list of the original grid.
  const [selected] = useState(() => (search.selection ? loadSelection() : []));
  const list = useInfiniteQuery(PhotoService.method.listPhotos, listInput(search), {
    pageParamKey: "pageToken",
    getNextPageParam: (last) => last.nextPageToken || undefined,
    enabled: !search.selection,
  });
  const chosen = useQueries({
    queries: selected.map((photoId) =>
      createQueryOptions(PhotoService.method.getPhoto, { photoId }, { transport }),
    ),
  });
  const sequence: PhotoSummary[] = search.selection
    ? chosen.flatMap((q) => (q.data?.photo?.summary ? [q.data.photo.summary] : []))
    : (list.data?.pages.flatMap((p) => p.photos) ?? []);
  const index = sequence.findIndex((p) => p.id === id);

  // Photo further in the timeline than the loaded pages: load more.
  useEffect(() => {
    if (!search.selection && index < 0 && list.hasNextPage && !list.isFetchingNextPage)
      void list.fetchNextPage();
  }, [index, list, search.selection]);

  const detail = useQuery(PhotoService.method.getPhoto, { photoId: id });
  const photo = detail.data?.photo;
  const summary = photo?.summary ?? sequence[index];
  const album = useQuery(
    PhotoService.method.getPhotoAlbum,
    { albumId: summary?.albumId ?? "" },
    { enabled: Boolean(summary?.albumId) },
  ).data?.album;

  const go = useCallback(
    (to: number) => {
      const p = sequence[to];
      if (p) void navigate({ to: "/play/photo/$id", params: { id: p.id }, search, replace: true });
    },
    [navigate, search, sequence],
  );
  const next = useCallback(() => {
    if (index + 1 < sequence.length) go(index + 1);
    else if (list.hasNextPage) void list.fetchNextPage();
    else if (playing) go(0);
  }, [go, index, list, playing, sequence.length]);
  const previous = useCallback(() => index > 0 && go(index - 1), [go, index]);
  const setPlaying = useCallback(
    (on: boolean) => {
      void navigate({
        to: "/play/photo/$id",
        params: { id },
        search: { ...search, slideshow: on || undefined },
        replace: true,
      });
      if (on) void stage.current?.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen();
    },
    [id, navigate, search],
  );

  // Slideshow: one photo every five seconds; leaving full screen stops it. The timer follows the
  // photo shown, not each render (the sequence is recomputed often).
  const nextRef = useRef(next);
  nextRef.current = next;
  // biome-ignore lint/correctness/useExhaustiveDependencies: one timer per photo shown.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => nextRef.current(), slideshowDelay);
    return () => clearTimeout(timer);
  }, [playing, id]);
  // Full screen is requested once, at start.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  useEffect(() => {
    if (playing) void stage.current?.requestFullscreen?.().catch(() => {});
    const onChange = () => !document.fullscreenElement && playing && setPlaying(false);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [playing]);

  // Controls hidden during the slideshow, back at the slightest gesture.
  useEffect(() => {
    if (!playing) {
      setIdle(false);
      return;
    }
    let timer = setTimeout(() => setIdle(true), 2500);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 2500);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
    };
  }, [playing]);

  const back: LinkProps = search.album
    ? { to: "/photos/albums/$id", params: { id: search.album } }
    : { to: "/photos", search: search.favorites ? { view: "favorites" } : {} };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") previous();
      else if (e.key === "i") setInfo((o) => !o);
      else if (e.key === " ") setPlaying(!playing);
      else if (e.key === "Escape" && !document.fullscreenElement) void navigate(back);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, navigate, next, playing, previous, setPlaying]);

  // Swiping with a finger: left, right.
  const swipe = useRef<number | null>(null);

  const image = summary && pickImage(summary.images, ImageKind.PHOTO);
  const width =
    typeof window === "undefined" ? 1280 : imageWidthFor(window.innerWidth, window.devicePixelRatio);

  // Neighboring photos loaded in advance.
  useEffect(() => {
    for (const p of [sequence[index + 1], sequence[index - 1]]) {
      const img = p && pickImage(p.images, ImageKind.PHOTO);
      if (img) new Image().src = imageUrl(img, width);
    }
  }, [index, sequence, width]);

  const strip = sequence.slice(Math.max(0, index - 5), index + 6);

  return (
    <main ref={stage} className={styles.stage} data-idle={idle} data-ui="viewer">
      <header className={styles.head} data-ui="viewer-top">
        <Link {...back} className={styles.round} aria-label={t("photos.close")}>
          <Icon name="close" size={14} />
        </Link>
        <div className={styles.heading}>
          <h1 className={styles.title}>{summary ? `${dayLabel(summary)} · ${timeLabel(summary)}` : ""}</h1>
          <span className={styles.sub}>
            {[
              album?.title,
              index >= 0
                ? t("photos.position", {
                    n: index + 1,
                    total: search.selection
                      ? sequence.length
                      : (list.data?.pages[0]?.totalSize ?? sequence.length),
                  })
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <span className={styles.spacer} />
        {summary && <Favorite photo={summary} />}
        <button
          type="button"
          className={styles.pill}
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? t("photos.stopSlideshow") : t("photos.slideshow")}
        </button>
        {image && (
          <a
            className={styles.pill}
            href={imageUrl(image)}
            download={summary?.title}
            title={t("photos.fullResolution")}
          >
            {t("photos.download")}
          </a>
        )}
        <button
          type="button"
          className={styles.pill}
          aria-expanded={info}
          aria-controls="photo-info"
          onClick={() => setInfo((o) => !o)}
        >
          {t("photos.info")}
        </button>
      </header>

      <div className={styles.body}>
        <button
          type="button"
          className={styles.side}
          onClick={previous}
          disabled={index <= 0}
          aria-label={t("photos.previous")}
        >
          <Icon name="back" />
        </button>
        <div
          className={styles.frame}
          onPointerDown={(e) => {
            swipe.current = e.clientX;
          }}
          onPointerUp={(e) => {
            const from = swipe.current;
            swipe.current = null;
            if (from === null || Math.abs(e.clientX - from) < 50) return;
            if (e.clientX < from) next();
            else previous();
          }}
        >
          {image && (
            <img
              key={summary?.id}
              className={styles.photo}
              src={imageUrl(image, width)}
              srcSet={imageSrcSet(image)}
              sizes="100vw"
              alt={summary?.title ?? ""}
              draggable={false}
            />
          )}
          {detail.isError && <p className={styles.error}>{errorMessage(detail.error)}</p>}
        </div>
        <button type="button" className={styles.side} onClick={next} aria-label={t("photos.next")}>
          <Icon name="chevron" />
        </button>

        {info && photo && (
          <aside
            id="photo-info"
            ref={infoRef}
            className={styles.info}
            aria-label={t("photos.infoLabel")}
            data-ui="viewer-panel"
          >
            <p className={styles.infoTitle}>{t("photos.infoTitle")}</p>
            <p className={styles.fileName}>{photo.summary?.title}</p>
            <dl className={styles.exif}>
              {exifLines(photo).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {photo.location && (
              <div className={styles.place}>
                <span className={styles.pin}>
                  <Icon name="pin" size={16} />
                </span>
                <span className={styles.placeText}>
                  <span>{coordinates(photo.location.latitude, photo.location.longitude)}</span>
                  <a
                    href={mapUrl(photo.location.latitude, photo.location.longitude)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("photos.openMap")}
                  </a>
                </span>
              </div>
            )}
            {album && (
              <Link to="/photos/albums/$id" params={{ id: album.id }} className={styles.albumLink}>
                {t("photos.album", { title: album.title })}
              </Link>
            )}
          </aside>
        )}
      </div>

      {strip.length > 1 && (
        <nav className={styles.strip} aria-label={t("photos.neighbours")} data-ui="viewer-strip">
          {strip.map((p) => {
            const img = pickImage(p.images, ImageKind.PHOTO);
            return (
              <Link
                key={p.id}
                to="/play/photo/$id"
                params={{ id: p.id }}
                search={search}
                replace
                className={styles.thumb}
                aria-current={p.id === id ? "true" : undefined}
                aria-label={p.title}
              >
                {img && <img src={imageUrl(img, 160)} alt="" loading="lazy" />}
              </Link>
            );
          })}
        </nav>
      )}
    </main>
  );
}

function Favorite({ photo }: { photo: PhotoSummary }) {
  const { t } = useTranslation();
  const refresh = useRefreshCatalog();
  const mutation = useMutation(CatalogService.method.setFavorite, { onSuccess: refresh });
  const on = Boolean(photo.userData?.favorite);
  return (
    <button
      type="button"
      className={styles.heart}
      aria-pressed={on}
      aria-label={on ? t("photos.removeFavorite") : t("photos.addFavorite")}
      title={mutation.isError ? errorMessage(mutation.error) : undefined}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ itemId: photo.id, favorite: !on })}
    >
      <Icon name="heart" size={18} filled={on} />
    </button>
  );
}
