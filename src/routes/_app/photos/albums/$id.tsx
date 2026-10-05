import { createQueryOptions, useInfiniteQuery, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../../api/errors";
import { FavoriteButton } from "../../../../features/catalog/actions";
import { JustifiedGrid } from "../../../../features/photos/JustifiedGrid";
import styles from "../../../../features/photos/photos.module.css";
import { AlbumCard, SelectionBar, useSelection } from "../../../../features/photos/Timeline";
import { PhotoService } from "../../../../gen/laterna/v1/photo_pb";
import { listInput } from "../../../../photos/context";
import { Alert } from "../../../../ui/Alert";
import { Icon } from "../../../../ui/Icon";

export const Route = createFileRoute("/_app/photos/albums/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(PhotoService.method.getPhotoAlbum, { albumId: params.id }, context),
    ),
  component: AlbumPage,
});

function AlbumPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const query = useQuery(PhotoService.method.getPhotoAlbum, { albumId: id });
  const album = query.data?.album;
  const parent = useQuery(
    PhotoService.method.getPhotoAlbum,
    { albumId: album?.parentId ?? "" },
    { enabled: Boolean(album?.parentId) },
  ).data?.album;
  const context = { album: id };
  const photos = useInfiniteQuery(PhotoService.method.listPhotos, listInput(context), {
    pageParamKey: "pageToken",
    getNextPageParam: (last) => last.nextPageToken || undefined,
  });
  const selection = useSelection();

  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  if (!album) return null;
  const list = photos.data?.pages.flatMap((p) => p.photos) ?? [];
  const children = query.data?.albums ?? [];
  const counts = [
    album.photoCount ? t("counts.photos", { count: album.photoCount }) : "",
    album.albumCount ? t("counts.albums", { count: album.albumCount }) : "",
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      <section className={styles.albumHead} data-ui="page-header" data-universe="photos">
        <nav aria-label={t("photos.parents")} className={styles.crumbs}>
          <Link to="/photos" search={{ view: "albums" }}>
            {t("photos.albums")}
          </Link>
          {parent && (
            <>
              <span aria-hidden="true">›</span>
              <Link to="/photos/albums/$id" params={{ id: parent.id }}>
                {parent.title}
              </Link>
            </>
          )}
        </nav>
        <h1 className={styles.albumHeadTitle}>{album.title}</h1>
        <p className={styles.albumHeadMeta}>{counts.join(" · ")}</p>
        <div className={styles.albumActions}>
          {list.length > 0 && (
            <button
              type="button"
              className={styles.slideshow}
              onClick={() =>
                void navigate({
                  to: "/play/photo/$id",
                  params: { id: list[0]?.id ?? "" },
                  search: { album: id, slideshow: true },
                })
              }
            >
              <Icon name="play" size={14} />
              {t("photos.slideshow")}
            </button>
          )}
          <FavoriteButton itemId={album.id} favorite={Boolean(album.userData?.favorite)} />
        </div>
      </section>

      {children.length > 0 && (
        <ul className={styles.albums}>
          {children.map((a) => (
            <li key={a.id}>
              <AlbumCard album={a} />
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && <JustifiedGrid photos={list} context={context} selection={selection} />}
      {photos.hasNextPage && (
        <button type="button" className={styles.more} onClick={() => void photos.fetchNextPage()}>
          {photos.isFetchingNextPage ? t("browse.loading") : t("common.seeMore")}
        </button>
      )}
      <SelectionBar photos={list} selection={selection} />
    </div>
  );
}
