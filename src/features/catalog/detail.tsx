import { useQuery } from "@connectrpc/connect-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatClock, formatRuntime, ImageKind, pickImage, seconds } from "../../api/media";
import {
  CatalogService,
  type Credit,
  CreditRole,
  type Image,
  type MediaFile,
  StreamKind,
  type UserData,
} from "../../gen/laterna/v1/catalog_pb";
import i18n from "../../i18n";
import { passageName, passages } from "../../player/logic";
import type { Universe } from "../../theme/contract";
import { Artwork } from "../../ui/Artwork";
import { MovieCard, SeriesCard } from "./cards";
import styles from "./detail.module.css";
import { codecName, fileSize, resolutionLabel, streamLabel } from "./format";

export interface HeroProps {
  universe: Universe;
  /** Small tags above the title: kind, year, rating, genres. */
  chips: string[];
  title: string;
  originalTitle?: string;
  tagline?: string;
  overview: string;
  /** Line of credits and counts under the overview. */
  line?: string;
  images: readonly Image[];
  /** Main image: the poster of a movie or a series, the thumbnail of an episode. */
  main: "poster" | "thumb";
  userData?: UserData;
  runtime?: number;
  breadcrumb?: ReactNode;
  actions: ReactNode;
}

/** Header of a detail page: large backdrop, poster, title, overview, actions. */
export function Hero(p: HeroProps) {
  const { t } = useTranslation();
  const backdrop = pickImage(p.images, ImageKind.BACKDROP, ImageKind.THUMB);
  const main =
    p.main === "poster"
      ? pickImage(p.images, ImageKind.POSTER)
      : pickImage(p.images, ImageKind.THUMB, ImageKind.BACKDROP);
  const position = seconds(p.userData?.position);
  return (
    <section className={styles.hero} data-ui="detail-hero" data-universe={p.universe}>
      {backdrop && p.main === "poster" && (
        <Artwork
          image={backdrop}
          sizes="100vw"
          ratio={21 / 8}
          universe={p.universe}
          className={styles.backdrop}
          data-ui="detail-backdrop"
        />
      )}
      <div className={styles.heroCard} data-main={p.main} data-ui="detail-card">
        <Artwork
          image={main}
          sizes={p.main === "poster" ? "280px" : "(max-width: 767px) 100vw, 480px"}
          ratio={p.main === "poster" ? 2 / 3 : 16 / 9}
          universe={p.universe}
          fallback={p.title}
          shape={p.main === "poster" ? "poster" : "card"}
          className={styles.mainArt}
        />
        <div className={styles.info}>
          {p.breadcrumb}
          <div className={styles.chips}>
            {p.chips.filter(Boolean).map((c, i) => (
              <span
                key={c}
                className={styles.chip}
                style={
                  i === 0
                    ? { background: `var(--color-${p.universe})`, color: `var(--color-${p.universe}-ink)` }
                    : undefined
                }
              >
                {c}
              </span>
            ))}
          </div>
          <h1 className={styles.title}>{p.title}</h1>
          {p.originalTitle && p.originalTitle !== p.title && (
            <p className={styles.original}>{p.originalTitle}</p>
          )}
          {p.tagline && <p className={styles.tagline}>{p.tagline}</p>}
          {p.overview && <p className={styles.overview}>{p.overview}</p>}
          {p.line && <p className={styles.line}>{p.line}</p>}
          {!p.userData?.played && position > 0 && p.runtime ? (
            <div className={styles.resume}>
              <span className={styles.bar}>
                <span
                  style={{
                    width: `${Math.min(100, (position / p.runtime) * 100)}%`,
                    background: `var(--color-${p.universe})`,
                  }}
                />
              </span>
              <span>
                {t("catalog.stoppedAt", {
                  time: formatClock(position),
                  left: formatRuntime(p.runtime - position),
                })}
              </span>
            </div>
          ) : null}
          <div className={styles.actions} data-ui="actions">
            {p.actions}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "Directed by X · Written by Y" from the credits. */
export function creditLine(credits: readonly Credit[]): string {
  const names = (role: CreditRole) =>
    credits
      .filter((c) => c.role === role)
      .map((c) => c.name)
      .slice(0, 3)
      .join(", ");
  return [
    names(CreditRole.DIRECTOR) && i18n.t("catalog.directedBy", { names: names(CreditRole.DIRECTOR) }),
    names(CreditRole.WRITER) && i18n.t("catalog.writtenBy", { names: names(CreditRole.WRITER) }),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Cast: actors with their photo and their role. */
export function Cast({ credits }: { credits: readonly Credit[] }) {
  const { t } = useTranslation();
  const actors = credits.filter((c) => c.role === CreditRole.ACTOR);
  if (actors.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="cast" data-ui="detail-section">
      <h2 id="cast" className={styles.panelTitle}>
        {t("catalog.cast")}
      </h2>
      <ul className={styles.cast} data-ui="cast">
        {actors.slice(0, 18).map((a) => (
          <li key={`${a.personId}-${a.character}`} className={styles.person}>
            <Artwork
              image={a.image}
              sizes="56px"
              ratio={1}
              universe="party"
              fallback={a.name.slice(0, 1)}
              shape="disc"
              className={styles.face}
            />
            <span>
              <span className={styles.personName}>{a.name}</span>
              {a.character && <span className={styles.muted}>{a.character}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Files of a movie or an episode: versions, video, audio tracks and subtitles. */
export function Files({ files }: { files: readonly MediaFile[] }) {
  const { t } = useTranslation();
  if (files.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="files" data-ui="detail-section">
      <h2 id="files" className={styles.panelTitle}>
        {t("catalog.files", { count: files.length })}
      </h2>
      {files.map((f) => {
        const video = f.streams.find((s) => s.kind === StreamKind.VIDEO);
        const audio = f.streams.filter((s) => s.kind === StreamKind.AUDIO);
        const subs = f.streams.filter((s) => s.kind === StreamKind.SUBTITLE);
        const head = [
          f.version || null,
          f.part > 0 ? t("catalog.part", { n: f.part }) : null,
          video
            ? [resolutionLabel(video.width, video.height), codecName(video.codec)].filter(Boolean).join(" ")
            : null,
          f.container.toUpperCase(),
          f.size > 0n ? fileSize(f.size) : null,
          f.duration ? formatRuntime(seconds(f.duration)) : null,
        ].filter(Boolean);
        return (
          <div key={f.id} className={styles.file}>
            <p className={styles.fileHead}>
              {head.join(" · ")}
              {!f.available && <span className={styles.missing}>{t("catalog.missing")}</span>}
            </p>
            {audio.length > 0 && (
              <p className={styles.streams}>
                <span className={styles.streamKind}>{t("catalog.audio")}</span>
                {audio.map((s) => streamLabel(s)).join(" ; ")}
              </p>
            )}
            {subs.length > 0 && (
              <p className={styles.streams}>
                <span className={styles.streamKind}>{t("catalog.subtitles")}</span>
                {subs.map((s) => streamLabel(s)).join(" ; ")}
              </p>
            )}
            {f.chapters.length > 0 && (
              <p className={styles.streams}>
                <span className={styles.streamKind}>{t("catalog.chapters")}</span>
                {f.chapters.length}
              </p>
            )}
            {f.segments.length > 0 && (
              <p className={styles.streams}>
                <span className={styles.streamKind}>{t("catalog.passages")}</span>
                {passages(f.segments)
                  .map((p) => `${passageName(p.kind)} ${formatClock(p.start)} → ${formatClock(p.end)}`)
                  .join(" ; ")}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * Titles similar to a movie or a series (genres, crew, collection, decade; server:
 * docs/design/home.md), most similar first. Nothing until there are some.
 */
export function Similar({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const items = useQuery(CatalogService.method.listSimilar, { itemId, limit: 12 }).data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="similar-titles" data-ui="detail-section">
      <h2 id="similar-titles" className={styles.panelTitle}>
        {t("catalog.similar")}
      </h2>
      <ul className={styles.similar} data-ui="grid">
        {items.map((it) =>
          it.item.case === "movie" ? (
            <li key={it.item.value.id}>
              <MovieCard movie={it.item.value} />
            </li>
          ) : it.item.case === "series" ? (
            <li key={it.item.value.id}>
              <SeriesCard series={it.item.value} />
            </li>
          ) : null,
        )}
      </ul>
    </section>
  );
}
