import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../../api/errors";
import { ImageKind, pickImage } from "../../../../api/media";
import { named } from "../../../../api/text";
import { PosterGrid } from "../../../../features/catalog/Browse";
import { AddToPlaylist } from "../../../../features/lists/AddToPlaylist";
import { AlbumCard, FavoriteRound } from "../../../../features/music/cards";
import styles from "../../../../features/music/music.module.css";
import { usePlay } from "../../../../features/music/usePlay";
import { MusicService } from "../../../../gen/laterna/v1/music_pb";
import { Alert } from "../../../../ui/Alert";
import { Artwork } from "../../../../ui/Artwork";
import { Icon } from "../../../../ui/Icon";

export const Route = createFileRoute("/_app/music/artists/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(MusicService.method.getArtist, { artistId: params.id }, context),
    ),
  component: ArtistPage,
});

function ArtistPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const query = useQuery(MusicService.method.getArtist, { artistId: id });
  const play = usePlay();

  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const a = query.data?.artist;
  if (!a) return null;
  const albums = query.data?.albums ?? [];
  return (
    <div className={styles.page}>
      <section className={styles.hero} data-artist="true" data-ui="page-header" data-universe="music">
        <Artwork
          image={pickImage(a.images, ImageKind.POSTER, ImageKind.THUMB)}
          sizes="260px"
          ratio={1}
          universe="music"
          fallback={named(a.name, a.nameText)}
          shape="round"
          className={styles.heroArt}
        />
        <div className={styles.heroInfo}>
          <span className={styles.chip}>{t("music.artist")}</span>
          <h1 className={styles.heroTitle}>{named(a.name, a.nameText)}</h1>
          <p className={styles.heroLine}>
            {[
              t("counts.albums", { count: a.albumCount }),
              t("counts.tracks", { count: a.trackCount }),
              a.genres.slice(0, 3).join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {a.overview && <p className={styles.overview}>{a.overview}</p>}
          <div className={styles.heroActions}>
            <button type="button" className={styles.listen} onClick={() => void play.artist(a.id)}>
              <Icon name="play" size={16} />
              {t("music.listenEverything")}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void play.artist(a.id, { shuffled: true })}
            >
              <Icon name="shuffle" />
              {t("music.mix")}
            </button>
            <FavoriteRound
              itemId={a.id}
              favorite={Boolean(a.userData?.favorite)}
              label={a.userData?.favorite ? t("music.removeFavorite") : t("music.addFavorite")}
            />
            <AddToPlaylist itemIds={[a.id]} what={t("what.artistTracks")} className={styles.roundAction}>
              <Icon name="listAdd" size={20} />
            </AddToPlaylist>
          </div>
        </div>
      </section>

      <h2 className={styles.sectionTitle}>{t("music.albumsTitle")}</h2>
      <PosterGrid>
        {albums.map((al) => (
          <li key={al.id}>
            <AlbumCard
              album={al}
              meta={[al.year || null, t("counts.tracks", { count: al.trackCount })]
                .filter(Boolean)
                .join(" · ")}
            />
          </li>
        ))}
      </PosterGrid>
    </div>
  );
}
