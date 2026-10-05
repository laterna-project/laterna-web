import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { Favorites, Genres, Heat, Split, Tiles, TimeChart } from "../../../features/stats/StatsView";
import { deviceTimeZone, timelineBars, yearsWithPlays } from "../../../features/stats/stats";
import styles from "../../../features/stats/stats.module.css";
import { HistoryService } from "../../../gen/laterna/v1/history_pb";
import { Alert } from "../../../ui/Alert";

interface Search {
  /** Calendar year; 0 = all time; missing = the current year. */
  year?: number;
}

export const Route = createFileRoute("/_app/account/stats")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const n = Number(s.year);
    return Number.isInteger(n) && n >= 0 && s.year !== undefined ? { year: n } : {};
  },
  component: StatsPage,
});

/** Your statistics: one year, or all time. */
function StatsPage() {
  const { t } = useTranslation();
  const { profile } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const thisYear = new Date().getFullYear();
  const year = search.year ?? thisYear;
  const timeZone = deviceTimeZone();
  const query = useQuery(HistoryService.method.getStats, { year, timeZone });
  const allTime = useQuery(HistoryService.method.getStats, { year: 0, timeZone });
  // The current year, then the years with sessions; "All time" last.
  const years = [...new Set([thisYear, ...yearsWithPlays(allTime.data?.stats, timeZone)])]
    .sort((a, b) => b - a)
    .slice(0, 4);
  const s = query.data?.stats;
  const period =
    year === 0
      ? t("stats.period.allTime")
      : year === thisYear
        ? t("stats.period.thisYear")
        : t("stats.period.inYear", { year });

  return (
    <>
      <div className={styles.head} data-ui="page-header">
        <div className={styles.headText}>
          <h1 className={styles.title}>{t("stats.title")}</h1>
          <p className={styles.subtitle}>{t("stats.subtitle", { name: profile.name })}</p>
        </div>
        <fieldset className={styles.periods}>
          <legend className="sr-only">{t("stats.periodLabel")}</legend>
          {[...years, 0].map((y) => (
            <button
              key={y}
              type="button"
              className={styles.period}
              aria-pressed={y === year}
              onClick={() => navigate({ search: { year: y === thisYear ? undefined : y }, replace: true })}
            >
              {y === 0 ? t("stats.sinceStart") : String(y)}
            </button>
          ))}
        </fieldset>
        {year !== 0 && s && s.plays > 0 && (
          <Link to="/account/year-in-review" search={{ year: year }} className={styles.cta}>
            {t("stats.review", { year })}
          </Link>
        )}
      </div>
      {query.isError && <Alert>{errorMessage(query.error)}</Alert>}
      {s && s.plays === 0 && <p className={styles.empty}>{t("stats.empty", { period })}</p>}
      {s && s.plays > 0 && (
        <>
          <Tiles stats={s} period={period} />
          <div className={styles.row2}>
            <TimeChart bars={timelineBars(s.timeline, year === 0, timeZone)} byYear={year === 0} />
            <Split stats={s} />
          </div>
          <div className={styles.row3}>
            <Genres stats={s} />
            <Heat stats={s} />
            <Favorites stats={s} />
          </div>
        </>
      )}
    </>
  );
}
