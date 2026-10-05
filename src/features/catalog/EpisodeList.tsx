import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatRuntime, ImageKind, pickImage, seconds } from "../../api/media";
import { named } from "../../api/text";
import type { Episode } from "../../gen/laterna/v1/catalog_pb";
import i18n from "../../i18n";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import styles from "./episodes.module.css";
import { longDate } from "./format";

export function episodeNumber(e: Episode): string {
  return e.numberEnd > 0
    ? i18n.t("catalog.episodeNumbers", { n: e.number, end: e.numberEnd })
    : i18n.t("catalog.episodeNumber", { n: e.number });
}

export function EpisodeList(p: {
  seasons: { number: number; name: string; unplayed: number }[];
  current: number;
  onSeason: (n: number) => void;
  unplayed: number;
  markAll: ReactNode;
  episodes: readonly Episode[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className={styles.panel} aria-labelledby="episodes" data-ui="detail-section">
      <h2 id="episodes" className={styles.hidden}>
        {t("catalog.episodesTitle")}
      </h2>
      <div className={styles.head}>
        <div className={styles.seasons} role="tablist" aria-label={t("catalog.seasonsLabel")}>
          {p.seasons.map((s) => (
            <button
              key={s.number}
              type="button"
              role="tab"
              aria-selected={s.number === p.current}
              className={styles.season}
              onClick={() => p.onSeason(s.number)}
            >
              {s.name}
            </button>
          ))}
        </div>
        {p.unplayed > 0 && <span className={styles.todo}>{t("catalog.toWatch", { n: p.unplayed })}</span>}
        <span className={styles.spacer} />
        {p.markAll}
      </div>
      <ul className={styles.list} aria-busy={p.loading} data-ui="episode-list">
        {p.episodes.map((e) => {
          const runtime = seconds(e.runtime);
          const position = seconds(e.userData?.position);
          const started = !e.userData?.played && position > 0 && runtime > 0;
          return (
            <li key={e.id}>
              <Link to="/episodes/$id" params={{ id: e.id }} className={styles.episode} data-ui="episode">
                <Artwork
                  image={pickImage(e.images, ImageKind.THUMB, ImageKind.BACKDROP)}
                  sizes="200px"
                  ratio={16 / 9}
                  universe="series"
                  fallback={String(e.number)}
                  className={styles.thumb}
                />
                <span className={styles.body}>
                  <span className={styles.number}>{episodeNumber(e)}</span>
                  <span className={styles.title}>{named(e.title, e.titleText)}</span>
                  <span className={styles.meta}>
                    {[
                      runtime > 0 ? formatRuntime(runtime) : "",
                      e.premiereDate ? longDate(e.premiereDate) : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {e.overview && <span className={styles.overview}>{e.overview}</span>}
                  {started && (
                    <span className={styles.progress}>
                      <span className={styles.bar}>
                        <span style={{ width: `${Math.min(100, (position / runtime) * 100)}%` }} />
                      </span>
                      {t("catalog.left", { time: formatRuntime(runtime - position) })}
                    </span>
                  )}
                </span>
                {e.userData?.played ? (
                  <span className={styles.played} role="img" aria-label={t("catalog.watched")}>
                    <Icon name="check" size={16} />
                  </span>
                ) : (
                  <span className={styles.unplayed} aria-hidden="true" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
