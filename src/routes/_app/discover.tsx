import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { MovieCard, SeriesCard } from "../../features/catalog/cards";
import styles from "../../features/discover/discover.module.css";
import { isRecommendation, rowTitle, rowUniverse } from "../../features/home/rows";
import { type HomeRow, HomeRowKind, HomeService } from "../../gen/laterna/v1/home_pb";
import { universeBlock } from "../../theme/universe";
import { Alert } from "../../ui/Alert";

/** Longer rows than on the home page: this is where everything is shown. */
const discover = { rowSize: 30 };

export const Route = createFileRoute("/_app/discover")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(createQueryOptions(HomeService.method.getHome, discover, context)),
  component: Discover,
});

/**
 * Discover: "Recommended for you" and "Because you watched ...", as the server computes them from
 * what the profile watched (server: docs/design/home.md), in full.
 */
function Discover() {
  const { t } = useTranslation();
  const query = useQuery(HomeService.method.getHome, discover);
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const rows = (query.data?.rows ?? []).filter((r) => isRecommendation(r.kind));
  // The "Because you watched" rows first: they say more than a general list.
  const ordered = [
    ...rows.filter((r) => r.kind === HomeRowKind.BECAUSE_YOU_WATCHED),
    ...rows.filter((r) => r.kind === HomeRowKind.RECOMMENDED),
  ];
  return (
    <div className={styles.page}>
      <header className={styles.intro} data-ui="page-header">
        <h1 className={styles.title}>{t("nav.discover")}</h1>
        <p className={styles.lead}>{t("discover.lead")}</p>
      </header>
      {query.data && ordered.length === 0 && <p className={styles.empty}>{t("discover.empty")}</p>}
      {ordered.map((row, i) => (
        <Recommendations key={`${row.kind}-${row.sourceItemId}`} row={row} id={`ideas-${i}`} />
      ))}
    </div>
  );
}

function Recommendations({ row, id }: { row: HomeRow; id: string }) {
  const universe = rowUniverse(row.kind);
  return (
    <section
      className={styles.block}
      style={universeBlock(universe)}
      aria-labelledby={id}
      data-ui="home-block"
      data-universe={universe}
    >
      <div className={styles.head} data-ui="block-head">
        <h2 id={id} className={styles.heading} data-ui="block-title">
          {rowTitle(row)}
        </h2>
      </div>
      <ul className={styles.grid} data-ui="grid">
        {row.items.map(({ item }) =>
          item.case === "movie" ? (
            <li key={item.value.id} className={styles.tile}>
              <MovieCard movie={item.value} />
            </li>
          ) : item.case === "series" ? (
            <li key={item.value.id} className={styles.tile}>
              <SeriesCard series={item.value} />
            </li>
          ) : null,
        )}
      </ul>
    </section>
  );
}
