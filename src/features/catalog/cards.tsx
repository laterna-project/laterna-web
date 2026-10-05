import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatRuntime, ImageKind, pickImage, seconds } from "../../api/media";
import type { MovieSummary, SeriesSummary, UserData } from "../../gen/laterna/v1/catalog_pb";
import i18n from "../../i18n";
import type { Universe } from "../../theme/contract";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import styles from "./cards.module.css";

/** Badges on a poster: watched, favorite, progress. */
function Badges({ userData, runtime }: { userData: UserData | undefined; runtime?: number }) {
  const { t } = useTranslation();
  const position = seconds(userData?.position);
  return (
    <>
      {userData?.played && (
        <span className={styles.played} data-ui="badge">
          <Icon name="check" size={11} />
          {t("catalog.watched")}
        </span>
      )}
      {userData?.favorite && (
        <span className={styles.favorite} role="img" aria-label={t("catalog.favorite")} data-ui="badge">
          <Icon name="heart" size={12} filled />
        </span>
      )}
      {!userData?.played && position > 0 && runtime ? (
        <span className={styles.progress} aria-hidden="true" data-ui="progress">
          <span style={{ width: `${Math.min(100, (position / runtime) * 100)}%` }} />
        </span>
      ) : null}
    </>
  );
}

function Poster({
  images,
  title,
  meta,
  universe,
  userData,
  runtime,
}: {
  images: MovieSummary["images"];
  title: string;
  meta: string;
  universe: Universe;
  userData: UserData | undefined;
  runtime?: number;
}) {
  return (
    <>
      <span className={styles.art}>
        <Artwork
          image={pickImage(images, ImageKind.POSTER)}
          sizes="(max-width: 767px) 45vw, 200px"
          ratio={2 / 3}
          universe={universe}
          fallback={title}
          shape="poster"
        />
        <Badges userData={userData} runtime={runtime} />
      </span>
      <span className={styles.title} data-ui="card-title">
        {title}
      </span>
      <span className={styles.meta} data-ui="card-meta">
        {meta}
      </span>
    </>
  );
}

export function movieMeta(m: MovieSummary): string {
  return [m.year || null, m.runtime && formatRuntime(seconds(m.runtime))].filter(Boolean).join(" · ");
}

export function seriesMeta(s: SeriesSummary): string {
  const eps = i18n.t("catalog.episodes", { count: s.episodeCount });
  return s.unplayedCount > 0 && s.unplayedCount < s.episodeCount
    ? `${eps} · ${i18n.t("catalog.toWatch", { n: s.unplayedCount })}`
    : eps;
}

export function MovieCard({ movie: m }: { movie: MovieSummary }) {
  return (
    <Link
      to="/movies/$id"
      params={{ id: m.id }}
      className={styles.card}
      data-ui="card"
      data-kind="movie"
      data-universe="movies"
    >
      <Poster
        images={m.images}
        title={m.title}
        meta={movieMeta(m)}
        universe="movies"
        userData={m.userData}
        runtime={seconds(m.runtime)}
      />
    </Link>
  );
}

export function SeriesCard({ series: s }: { series: SeriesSummary }) {
  return (
    <Link
      to="/series/$id"
      params={{ id: s.id }}
      className={styles.card}
      data-ui="card"
      data-kind="series"
      data-universe="series"
    >
      <Poster
        images={s.images}
        title={s.title}
        meta={seriesMeta(s)}
        universe="series"
        userData={s.userData}
      />
    </Link>
  );
}
