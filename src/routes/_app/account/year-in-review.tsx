import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { seconds } from "../../../api/media";
import {
  busiestBar,
  deviceTimeZone,
  entryTitle,
  hoursLabel,
  timelineBars,
  wholeDays,
  yearsWithPlays,
} from "../../../features/stats/stats";
import styles from "../../../features/stats/stats.module.css";
import { HistoryService, type Stats } from "../../../gen/laterna/v1/history_pb";
import i18n, { locale } from "../../../i18n";
import type { Universe } from "../../../theme/contract";
import { Alert } from "../../../ui/Alert";
import { Icon } from "../../../ui/Icon";

interface Search {
  year: number;
}

export const Route = createFileRoute("/_app/account/year-in-review")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const n = Number(s.year);
    return { year: Number.isInteger(n) && n > 1900 ? n : new Date().getFullYear() };
  },
  component: YearInReview,
});

const dayDate = (d: Parameters<typeof timestampDate>[0]) =>
  new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long" }).format(timestampDate(d));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Card {
  label: string;
  value: string;
  sub: string;
  universe: Universe;
  wide?: boolean;
}

/** The cards of the year in review, from what the server counted; a card without data is not shown. */
function cards(s: Stats, timeZone: string): Card[] {
  const t = i18n.t;
  const list: (Card | false | undefined)[] = [];
  const series = s.topSeries[0];
  list.push(
    series && {
      label: t("review.series"),
      value: series.name,
      sub: t("review.seriesSub", { time: hoursLabel(seconds(series.time)), count: series.plays }),
      universe: "series",
    },
  );
  const movie = s.topMovies[0];
  list.push(
    movie && {
      label: movie.plays > 1 ? t("review.mostRewatched") : t("review.movie"),
      value: movie.name,
      sub: movie.plays > 1 ? t("review.watchedTimes", { n: movie.plays }) : hoursLabel(seconds(movie.time)),
      universe: "movies",
    },
  );
  const artist = s.topArtists[0];
  const track = s.topTracks[0];
  list.push(
    artist && {
      label: t("review.artist"),
      value: artist.name,
      sub: [
        hoursLabel(seconds(artist.time)),
        track && t("review.trackPlays", { name: track.name, count: track.plays }),
      ]
        .filter(Boolean)
        .join(" · "),
      universe: "music",
    },
  );
  list.push(
    s.binge &&
      s.binge.episodes > 1 && {
        label: t("review.binge"),
        value: t("stats.bingeEpisodes", { count: s.binge.episodes }),
        sub: s.binge.day
          ? t("review.bingeSubDay", { series: s.binge.series, date: dayDate(s.binge.day) })
          : t("review.bingeSub", { series: s.binge.series }),
        universe: "playlists",
        wide: true,
      },
  );
  const month = busiestBar(timelineBars(s.timeline, false, timeZone));
  list.push(
    month &&
      month.seconds > 0 && {
        label: t("review.month"),
        value: capitalize(month.long.replace(/\s\d+$/, "")),
        sub: hoursLabel(month.seconds),
        universe: "collections",
      },
  );
  const genre = s.topGenres[0];
  list.push(
    genre && {
      label: t("review.genre"),
      value: genre.name,
      sub: hoursLabel(seconds(genre.time)),
      universe: "books",
    },
  );
  list.push(
    s.busiestDay?.start && {
      label: t("review.busiestDay"),
      value: dayDate(s.busiestDay.start),
      sub: hoursLabel(seconds(s.busiestDay.time)),
      universe: "party",
    },
  );
  list.push(
    s.first?.startedAt && {
      label: t("review.first"),
      value: entryTitle(s.first),
      sub: t("review.firstSub", { date: dayDate(s.first.startedAt) }),
      universe: "photos",
    },
  );
  return list.filter((c): c is Card => Boolean(c));
}

/** Your year: the time spent, then one card per highlight. */
function YearInReview() {
  const { t } = useTranslation();
  const { profile } = Route.useRouteContext();
  const { year } = Route.useSearch();
  const timeZone = deviceTimeZone();
  const query = useQuery(HistoryService.method.getStats, { year: year, timeZone });
  const allTime = useQuery(HistoryService.method.getStats, { year: 0, timeZone });
  const before = yearsWithPlays(allTime.data?.stats, timeZone).find((y) => y < year);
  const s = query.data?.stats;
  const bars = s ? timelineBars(s.timeline, false, timeZone) : [];
  const peak = busiestBar(bars);
  const top = Math.max(1, ...bars.map((b) => b.seconds));
  const music = s ? seconds(s.musicTime) : 0;
  const days = s ? wholeDays(seconds(s.total)) : "";

  return (
    <>
      <div className={styles.head} data-ui="page-header">
        <div className={styles.headText}>
          <p className={styles.subtitle}>{t("review.subtitle", { name: profile.name })}</p>
          <h1 className={styles.title}>{t("review.title", { year: year })}</h1>
        </div>
        <Link to="/account/stats" search={{ year }} className={styles.ghost}>
          <Icon name="back" size={16} />
          {t("review.statistics")}
        </Link>
        {before && (
          <Link to="/account/year-in-review" search={{ year: before }} className={styles.cta}>
            {t("review.revisit", { year: before })}
          </Link>
        )}
      </div>
      {query.isError && <Alert>{errorMessage(query.error)}</Alert>}
      {s && s.plays === 0 && <p className={styles.empty}>{t("review.empty", { year: year })}</p>}
      {s && s.plays > 0 && (
        <div className={styles.recap}>
          <section className={styles.recapTotal} aria-label={t("review.total")}>
            <span className={styles.recapLabel}>{t("review.total")}</span>
            <span>
              <span className={styles.recapHuge}>{hoursLabel(seconds(s.total))}</span>
              <span className={styles.recapSentence}>
                {days || t("stats.sessions", { count: s.plays })}
                {music > 0 ? t("review.withMusic", { time: hoursLabel(music) }) : "."}
              </span>
            </span>
            <span
              className={styles.spark}
              role="img"
              aria-label={t("review.spark", { year: year, month: peak?.long ?? "" })}
            >
              {bars.map((b) => (
                <span
                  key={b.long}
                  data-peak={b === peak}
                  style={{ height: `${Math.max(3, (b.seconds / top) * 100)}%` }}
                />
              ))}
            </span>
          </section>
          {cards(s, timeZone).map((c) => (
            <section
              key={c.label}
              className={styles.recapCard}
              data-wide={c.wide ? "true" : undefined}
              style={{ background: `var(--color-${c.universe})`, color: `var(--color-${c.universe}-ink)` }}
              aria-label={c.label}
            >
              <span className={styles.recapLabel}>{c.label}</span>
              <span>
                <span className={styles.recapValue}>{c.value}</span>
                <span className={styles.recapSub}>{c.sub}</span>
              </span>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
