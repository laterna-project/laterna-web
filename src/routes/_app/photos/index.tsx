import { useInfiniteQuery, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import browseStyles from "../../../features/catalog/browse.module.css";
import styles from "../../../features/photos/photos.module.css";
import { AlbumCard, SelectionBar, Timeline, useSelection } from "../../../features/photos/Timeline";
import { PhotoService } from "../../../gen/laterna/v1/photo_pb";
import { listInput, type PhotoContext } from "../../../photos/context";
import { spanLabel, yearsOf } from "../../../photos/logic";
import { universeBlock } from "../../../theme/universe";
import { Alert } from "../../../ui/Alert";
import { scrollBehavior } from "../../../ui/motion";

type View = "albums" | "favorites";

export const Route = createFileRoute("/_app/photos/")({
  validateSearch: (search: Record<string, unknown>): { view?: View } =>
    search.view === "albums" || search.view === "favorites" ? { view: search.view } : {},
  component: Photos,
});

const tabs = [
  [undefined, "photos.tabs.timeline"],
  ["albums", "photos.tabs.albums"],
  ["favorites", "photos.tabs.favorites"],
] as const satisfies readonly [View | undefined, string][];

function Photos() {
  const { t } = useTranslation();
  const { view } = Route.useSearch();
  const context: PhotoContext = view === "favorites" ? { favorites: true } : {};
  const photos = useInfiniteQuery(PhotoService.method.listPhotos, listInput(context), {
    pageParamKey: "pageToken",
    getNextPageParam: (last) => last.nextPageToken || undefined,
    enabled: view !== "albums",
  });
  const all = useQuery(PhotoService.method.listPhotos, { ...listInput({}), pageSize: 1 });
  const months = useQuery(PhotoService.method.listPhotoMonths, {
    libraryId: "",
    albumId: "",
    favoritesOnly: view === "favorites",
  });
  const albums = useQuery(PhotoService.method.listPhotoAlbums, { libraryId: "" });
  const selection = useSelection();
  const list = photos.data?.pages.flatMap((p) => p.photos) ?? [];
  const years = yearsOf(months.data?.months ?? []);

  // The next page loads when nearing the bottom.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) =>
        e?.isIntersecting && photos.hasNextPage && !photos.isFetchingNextPage && void photos.fetchNextPage(),
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [photos]);

  // Year of the first visible day, highlighted in the year bar.
  const [year, setYear] = useState<number | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: days are read again for each loaded page.
  useEffect(() => {
    const days = Array.from(document.querySelectorAll<HTMLElement>("[id^='day-']"));
    const visible = new Set<HTMLElement>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target as HTMLElement);
        else visible.delete(e.target as HTMLElement);
      }
      const top = days.find((d) => visible.has(d));
      if (top) setYear(Number(top.id.slice(5, 9)));
    });
    for (const d of days) io.observe(d);
    return () => io.disconnect();
  }, [list.length]);

  const goToYear = async (y: number) => {
    let next = photos.hasNextPage;
    // Loads more until that year (the timeline goes from the most recent to the oldest).
    while (!document.querySelector(`[id^='day-${y}']`) && next) {
      next = (await photos.fetchNextPage()).hasNextPage;
      await new Promise((r) => requestAnimationFrame(r));
    }
    document
      .querySelector(`[id^='day-${y}']`)
      ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };

  const total = all.data?.totalSize ?? 0;
  const top = albums.data?.albums ?? [];
  const albumCount = top.reduce((n, a) => n + 1 + a.albumCount, 0);
  const error = photos.error ?? albums.error;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  return (
    <div className={browseStyles.page}>
      <section
        className={browseStyles.head}
        style={universeBlock("photos")}
        data-ui="page-header"
        data-universe="photos"
      >
        <div>
          <h1 className={browseStyles.title}>{t("nav.photos")}</h1>
          <p className={browseStyles.subtitle}>
            {[
              t("photos.inAlbums", {
                photos: t("counts.photos", { count: total }),
                albums: t("counts.albums", { count: albumCount }),
              }),
              spanLabel(months.data?.months ?? []),
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          <nav className={browseStyles.tabs} aria-label={t("photos.display")}>
            {tabs.map(([v, label]) => (
              <Link
                key={label}
                to="/photos"
                search={v ? { view: v } : {}}
                className={browseStyles.tab}
                aria-current={view === v ? "page" : undefined}
                activeOptions={{ exact: true, includeSearch: true }}
                replace
              >
                {t(label)}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {view === "albums" ? (
        <ul className={styles.albums}>
          {top.map((a) => (
            <li key={a.id}>
              <AlbumCard album={a} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.withRail}>
          <div>
            {list.length === 0 && !photos.isPending ? (
              <p className={styles.empty}>
                {view === "favorites" ? t("photos.noFavorites") : t("photos.none")}
              </p>
            ) : (
              <Timeline photos={list} context={context} selection={selection} />
            )}
            <div ref={sentinel} aria-hidden="true" />
          </div>
          {years.length > 1 && (
            <nav className={styles.years} aria-label={t("photos.years")}>
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={styles.year}
                  aria-current={y === (year ?? years[0]) ? "true" : undefined}
                  onClick={() => void goToYear(y)}
                >
                  {y}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}
      <SelectionBar photos={list} selection={selection} />
    </div>
  );
}
