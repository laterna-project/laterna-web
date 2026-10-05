import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../../api/errors";
import { formatRuntime, ImageKind, pickImage, seconds } from "../../../../api/media";
import { named } from "../../../../api/text";
import { DownloadButton } from "../../../../features/downloads/DownloadButton";
import { AddToPlaylist } from "../../../../features/lists/AddToPlaylist";
import { FavoriteRound } from "../../../../features/music/cards";
import styles from "../../../../features/music/music.module.css";
import { ArtistLink, TrackList } from "../../../../features/music/TrackList";
import { usePlay } from "../../../../features/music/usePlay";
import { MusicService } from "../../../../gen/laterna/v1/music_pb";
import { useMusic } from "../../../../music/MusicProvider";
import { StartParty } from "../../../../party/StartParty";
import { Alert } from "../../../../ui/Alert";
import { Artwork } from "../../../../ui/Artwork";
import { Icon } from "../../../../ui/Icon";

export const Route = createFileRoute("/_app/music/albums/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(MusicService.method.getAlbum, { albumId: params.id }, context),
    ),
  component: AlbumPage,
});

function AlbumPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const query = useQuery(MusicService.method.getAlbum, { albumId: id });
  const a = query.data?.album;
  const artist = useQuery(
    MusicService.method.getArtist,
    { artistId: a?.artistId ?? "" },
    { enabled: Boolean(a?.artistId) },
  );
  const music = useMusic();
  const play = usePlay();

  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  if (!a) return null;
  const tracks = query.data?.tracks ?? [];
  const others = (artist.data?.albums ?? []).filter((x) => x.id !== a.id).slice(0, 4);
  const runtime = seconds(a.runtime);
  // This album is in the player: the big button pauses or resumes it.
  const inPlayer = music.current?.albumId === a.id;
  const hasGain = tracks.some(
    (t) => t.replayGain?.albumGain !== undefined || t.replayGain?.trackGain !== undefined,
  );
  const gain =
    music.gainSetting === "off"
      ? null
      : music.gainSetting === "track"
        ? t("music.gainTrack")
        : t("music.gainAlbum");

  return (
    <div className={styles.page}>
      <section className={styles.hero} data-ui="page-header" data-universe="music">
        <Artwork
          image={pickImage(a.images, ImageKind.POSTER)}
          sizes="(max-width: 960px) 260px, 380px"
          ratio={1}
          universe="music"
          fallback={named(a.title, a.titleText)}
          shape="disc"
          className={styles.heroArt}
        />
        <div className={styles.heroInfo}>
          <span className={styles.chip}>
            {t("music.album")}
            {a.year ? ` · ${a.year}` : ""}
          </span>
          <h1 className={styles.heroTitle}>{named(a.title, a.titleText)}</h1>
          <ArtistLink id={a.artistId} name={a.artistName} />
          <p className={styles.heroLine}>
            {[
              t("counts.tracks", { count: a.trackCount }),
              runtime > 0 ? formatRuntime(runtime) : "",
              a.genres.slice(0, 3).join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.listen}
              onClick={() => (inPlayer ? music.toggle() : music.play(tracks, 0))}
              disabled={tracks.length === 0}
            >
              <Icon name={inPlayer && music.playing ? "pause" : "play"} size={16} />
              {inPlayer ? (music.playing ? t("music.pause") : t("music.resume")) : t("music.listenAll")}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => music.play(tracks, 0, { shuffled: true })}
              disabled={tracks.length === 0}
            >
              <Icon name="shuffle" />
              {t("music.shuffleButton")}
            </button>
            <FavoriteRound
              itemId={a.id}
              favorite={Boolean(a.userData?.favorite)}
              label={a.userData?.favorite ? t("music.removeFavorite") : t("music.addFavorite")}
            />
            <AddToPlaylist itemIds={[a.id]} what={t("what.album")} className={styles.roundAction}>
              <Icon name="listAdd" size={20} />
            </AddToPlaylist>
            <StartParty itemIds={[a.id]} className={styles.roundAction}>
              <Icon name="people" size={20} />
            </StartParty>
            <DownloadButton itemIds={[a.id]} what={t("what.album")} music className={styles.roundAction}>
              <Icon name="download" size={20} />
            </DownloadButton>
            <button
              type="button"
              className={styles.roundAction}
              onClick={() => music.append(tracks)}
              aria-label={t("music.addAlbumToQueue")}
              title={t("music.addToQueue")}
            >
              <Icon name="queueAdd" size={20} />
            </button>
          </div>
          {hasGain && gain && <span className={styles.gainChip}>{t("music.gainChip", { mode: gain })}</span>}
        </div>
      </section>

      <div className={styles.body}>
        <section className={styles.panel} aria-label={t("music.tracksLabel")}>
          <TrackList tracks={tracks} album />
        </section>
        <aside className={styles.aside}>
          {a.overview && (
            <section className={styles.asideCard}>
              <h2 className={styles.asideTitle}>{t("music.about")}</h2>
              <p className={styles.overview}>{a.overview}</p>
            </section>
          )}
          {others.length > 0 && (
            <section className={styles.asideCard}>
              <h2 className={styles.asideTitle}>{t("music.sameArtist")}</h2>
              <ul className={styles.more}>
                {others.map((o) => (
                  <li key={o.id}>
                    <Link to="/music/albums/$id" params={{ id: o.id }} className={styles.moreItem}>
                      <Artwork
                        image={pickImage(o.images, ImageKind.POSTER)}
                        sizes="64px"
                        ratio={1}
                        universe="music"
                        fallback={o.title}
                        shape="disc"
                        className={styles.moreArt}
                      />
                      <span className={styles.moreText}>
                        <span className={styles.moreTitle}>{o.title}</span>
                        <span className={styles.moreMeta}>
                          {[o.year || null, t("counts.tracks", { count: o.trackCount })]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={styles.asideCard} data-accent="true">
            <h2 className={styles.asideTitle}>{t("music.allOf", { name: a.artistName })}</h2>
            <p className={styles.asideText}>{t("music.allTracks")}</p>
            <div className={styles.small}>
              <button type="button" className={styles.listen} onClick={() => void play.artist(a.artistId)}>
                {t("music.listenAll")}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void play.artist(a.artistId, { shuffled: true })}
              >
                {t("music.mix")}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
