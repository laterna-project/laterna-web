import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageKind, pickImage, seconds } from "../../api/media";
import type { Stats } from "../../gen/laterna/v1/history_pb";
import { locale } from "../../i18n";
import { Artwork } from "../../ui/Artwork";
import {
  type Bar,
  dayNames,
  favorites,
  heatmap,
  hoursLabel,
  hourTicks,
  peakMoment,
  slots,
  tickLabel,
  timeSplit,
} from "./stats";
import styles from "./stats.module.css";

/** Top tiles: total time, then movies, episodes, music. */
export function Tiles({ stats: s, period }: { stats: Stats; period: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.tiles}>
      <div className={styles.total}>
        <span>{t("stats.timeSpent")}</span>
        <span className={styles.totalValue}>{hoursLabel(seconds(s.total))}</span>
        <span>
          {period} · {t("stats.sessions", { count: s.plays })}
        </span>
      </div>
      <Tile
        universe="movies"
        label={t("stats.movies")}
        value={String(s.movies)}
        sub={hoursLabel(seconds(s.moviesTime))}
      />
      <Tile
        universe="series"
        label={t("stats.episodes")}
        value={String(s.episodes)}
        sub={`${t("catalog.seriesCount", { count: s.series })} · ${hoursLabel(seconds(s.episodesTime))}`}
      />
      <Tile
        universe="music"
        label={t("stats.music")}
        value={hoursLabel(seconds(s.musicTime))}
        sub={t("stats.tracksPlayed", { count: s.tracks })}
      />
    </div>
  );
}

function Tile({
  universe,
  label,
  value,
  sub,
}: {
  universe: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>
        <span className={styles.dot} style={{ background: `var(--color-${universe})` }} aria-hidden="true" />
        {label}
      </span>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.muted}>{sub}</span>
    </div>
  );
}

/**
 * Time played per month (one year) or per year (all time): a series of bars, and the same content
 * as a table, on request.
 */
export function TimeChart({ bars, byYear }: { bars: readonly Bar[]; byYear: boolean }) {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const ticks = hourTicks(Math.max(0, ...bars.map((b) => b.seconds)));
  const top = (ticks.at(-1) ?? 1) * 3600;
  const title = byYear ? t("stats.hoursByYear") : t("stats.hoursByMonth");
  return (
    <section className={styles.card} aria-labelledby="by-period">
      <div className={styles.cardHead}>
        <h2 id="by-period" className={styles.cardTitle}>
          {title}
        </h2>
        <button type="button" className={styles.link} onClick={() => setAsTable((on) => !on)}>
          {asTable ? t("stats.asBars") : t("stats.asTable")}
        </button>
      </div>
      {asTable ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{byYear ? t("stats.year") : t("stats.month")}</th>
              <th scope="col">{t("stats.timePlayed")}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.long}>
                <th scope="row">{b.long}</th>
                <td>{hoursLabel(b.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.chart} role="img" aria-label={t("stats.chartLabel", { title })}>
          <div className={styles.axis} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} className={styles.tick} style={{ bottom: `${(tick * 3600 * 100) / top}%` }}>
                {tickLabel(tick)}
              </span>
            ))}
          </div>
          <div className={styles.plot} aria-hidden="true">
            {ticks.map((tick) => (
              <span
                key={tick}
                className={`${styles.grid} ${tick === 0 ? styles.baseline : ""}`}
                style={{ bottom: `${(tick * 3600 * 100) / top}%` }}
              />
            ))}
            <div className={styles.bars}>
              {bars.map((b) => (
                <span key={b.long} className={styles.barSlot}>
                  <span className={styles.bar} style={{ height: `${(b.seconds * 100) / top}%` }} />
                  <span className={styles.barTip} style={{ bottom: `${(b.seconds * 100) / top}%` }}>
                    {b.long} · {hoursLabel(b.seconds)}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <span />
          <div className={styles.labels} aria-hidden="true">
            {bars.map((b) => (
              <span key={b.long}>{b.label}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Breakdown of the time (one bar per kind), and the biggest day of a series. */
export function Split({ stats: s }: { stats: Stats }) {
  const { t } = useTranslation();
  const shares = timeSplit(s);
  const binge = s.binge;
  return (
    <section className={styles.card} aria-labelledby="breakdown">
      <h2 id="breakdown" className={styles.cardTitle}>
        {t("stats.split")}
      </h2>
      <ul className={styles.hbars}>
        {shares.map((p) => (
          <li key={p.label} className={styles.hbar}>
            <span className={styles.hbarName}>{p.label}</span>
            <span className={styles.hbarTrack}>
              <span className={styles.hbarFill} style={{ width: `${p.percent * 0.7}%` }} />
              <span className={styles.hbarValue}>
                {hoursLabel(p.seconds)} · {p.percent} %
              </span>
            </span>
          </li>
        ))}
      </ul>
      {binge && binge.episodes > 1 && (
        <p className={styles.note}>
          {t("stats.bingeBefore")}
          <strong>{t("stats.bingeEpisodes", { count: binge.episodes })}</strong>
          {t("stats.bingeOf", { series: binge.series })}
          {binge.day
            ? t("stats.bingeDay", {
                date: new Intl.DateTimeFormat(locale(), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(timestampDate(binge.day)),
              })
            : ""}
          .
        </p>
      )}
    </section>
  );
}

export function Genres({ stats: s }: { stats: Stats }) {
  const { t } = useTranslation();
  const top = Math.max(1, ...s.topGenres.map((g) => seconds(g.time)));
  return (
    <section className={styles.card} aria-labelledby="genres">
      <h2 id="genres" className={styles.cardTitle}>
        {t("stats.genres")}
      </h2>
      {s.topGenres.length === 0 ? (
        <p className={styles.muted}>{t("stats.genresEmpty")}</p>
      ) : (
        <ul className={styles.hbars}>
          {s.topGenres.map((g) => (
            <li key={g.name} className={styles.hbar}>
              <span className={styles.hbarName}>{g.name}</span>
              <span className={styles.hbarTrack}>
                <span className={styles.hbarFill} style={{ width: `${(seconds(g.time) / top) * 70}%` }} />
                <span className={styles.hbarValue}>{hoursLabel(seconds(g.time))}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "When do you watch?": days of the week and three-hour slots. */
export function Heat({ stats: s }: { stats: Stats }) {
  const { t } = useTranslation();
  const days = dayNames("short");
  const cells = heatmap(s.byHour);
  const peak = peakMoment(cells);
  const level = [styles.level0, styles.level1, styles.level2, styles.level3, styles.level4];
  return (
    <section className={styles.card} aria-labelledby="when">
      <h2 id="when" className={styles.cardTitle}>
        {t("stats.when")}
      </h2>
      <div className={styles.heat} aria-hidden="true">
        <span />
        {slots.map((h) => (
          <span key={h} className={styles.heatHead}>
            {t("stats.hour", { h })}
          </span>
        ))}
        {days.map((d, day) => (
          <Row key={d} label={d}>
            {cells
              .filter((c) => c.day === day)
              .map((c) => (
                <span
                  key={c.slot}
                  className={`${styles.cell} ${level[c.level]}`}
                  title={t("stats.cellTitle", {
                    day: d,
                    from: slots[c.slot],
                    to: (slots[c.slot] ?? 0) + 3,
                    time: hoursLabel(c.seconds),
                  })}
                />
              ))}
          </Row>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t("stats.heatCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("stats.day")}</th>
            {slots.map((h) => (
              <th key={h} scope="col">
                {t("stats.hour", { h })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d, day) => (
            <tr key={d}>
              <th scope="row">{d}</th>
              {cells
                .filter((c) => c.day === day)
                .map((c) => (
                  <td key={c.slot}>{hoursLabel(c.seconds)}</td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.legend}>
        <span aria-hidden="true">{t("stats.less")}</span>
        {level.slice(1).map((l) => (
          <span key={l} className={`${styles.cell} ${l}`} aria-hidden="true" />
        ))}
        <span aria-hidden="true">{t("stats.more")}</span>
        {peak && <span>· {peak}</span>}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className={styles.heatDay}>{label}</span>
      {children}
    </>
  );
}

/** Top items: the most played series, movies and artists, with their image. */
export function Favorites({ stats: s }: { stats: Stats }) {
  const { t } = useTranslation();
  const list = favorites(s);
  return (
    <section className={styles.card} aria-labelledby="top">
      <h2 id="top" className={styles.cardTitle}>
        {t("stats.favorites")}
      </h2>
      {list.length === 0 ? (
        <p className={styles.muted}>{t("stats.nothingYet")}</p>
      ) : (
        <ul className={styles.favorites}>
          {list.map((f) => (
            <li key={`${f.kind}-${f.id || f.name}`} className={styles.favorite}>
              <Artwork
                image={pickImage(f.images, ImageKind.POSTER, ImageKind.THUMB)}
                sizes="44px"
                ratio={f.kind === "artist" ? 1 : 2 / 3}
                universe={f.kind === "movie" ? "movies" : f.kind === "series" ? "series" : "music"}
                fallback={f.name.slice(0, 1)}
                shape={f.kind === "artist" ? "round" : "poster"}
                className={styles.favoriteArt}
              />
              <span className={styles.favoriteText}>
                <span className={styles.favoriteName}>{f.name}</span>
                <span className={styles.muted}>{f.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
