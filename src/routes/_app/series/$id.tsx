import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { formatRating, seconds } from "../../../api/media";
import { named } from "../../../api/text";
import {
  DownloadAction,
  FavoriteButton,
  ListButton,
  MarkAllButton,
  PartyButton,
  PlayButtons,
  PlayedButton,
} from "../../../features/catalog/actions";
import { Cast, creditLine, Hero, Similar } from "../../../features/catalog/detail";
import { EpisodeList } from "../../../features/catalog/EpisodeList";
import { episodeCode } from "../../../features/catalog/format";
import styles from "../../../features/catalog/page.module.css";
import { CatalogService, type Season } from "../../../gen/laterna/v1/catalog_pb";
import i18n from "../../../i18n";
import { episodeToPlay } from "../../../player/logic";
import { Alert } from "../../../ui/Alert";

export const Route = createFileRoute("/_app/series/$id")({
  validateSearch: (search: Record<string, unknown>): { season?: number } => {
    const n = Number(search.season);
    return Number.isInteger(n) && n >= 0 ? { season: n } : {};
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        createQueryOptions(CatalogService.method.getSeries, { seriesId: params.id }, context),
      ),
      // The whole series, for the "Play" button (episode in progress, otherwise the first to
      // watch).
      context.queryClient.ensureQueryData(
        createQueryOptions(
          CatalogService.method.listEpisodes,
          { seriesId: params.id, seasonId: "" },
          context,
        ),
      ),
    ]),
  component: SeriesPage,
});

/** Season shown first: the first one left to watch, otherwise the first. */
function defaultSeason(seasons: readonly Season[]): Season | undefined {
  return (
    seasons.find((s) => s.unplayedCount > 0 && s.number > 0) ??
    seasons.find((s) => s.number > 0) ??
    seasons[0]
  );
}

function seasonName(s: Season): string {
  return (
    named(s.title, s.titleText) ||
    (s.number === 0 ? i18n.t("catalog.specials") : i18n.t("catalog.season", { n: s.number }))
  );
}

function SeriesPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { season: seasonNumber } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(CatalogService.method.getSeries, { seriesId: id });
  const seasons = query.data?.seasons ?? [];
  const season = seasons.find((s) => s.number === seasonNumber) ?? defaultSeason(seasons);
  const episodes = useQuery(
    CatalogService.method.listEpisodes,
    { seriesId: id, seasonId: season?.id ?? "" },
    { enabled: Boolean(season) },
  );
  // The whole series for "Play": the episode in progress, otherwise the first to watch.
  const all = useQuery(CatalogService.method.listEpisodes, { seriesId: id, seasonId: "" });
  const toPlay = episodeToPlay(all.data?.episodes ?? []);

  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const s = query.data?.series;
  if (!s) return null;
  const counts = [
    t("catalog.seasons", { count: seasons.filter((x) => x.number > 0).length || seasons.length }),
    t("catalog.episodes", { count: s.episodeCount }),
    s.unplayedCount > 0 && s.unplayedCount < s.episodeCount
      ? t("catalog.toWatch", { n: s.unplayedCount })
      : "",
  ];
  return (
    <div className={styles.page}>
      <Hero
        universe="series"
        chips={[
          t("catalog.series"),
          s.year ? String(s.year) : "",
          s.officialRating ? formatRating(s.officialRating) : "",
          s.genres.slice(0, 3).join(" · "),
        ]}
        title={s.title}
        originalTitle={s.originalTitle}
        tagline={s.tagline}
        overview={s.overview}
        line={[creditLine(s.credits), s.studios.slice(0, 2).join(", "), ...counts]
          .filter(Boolean)
          .join(" · ")}
        images={s.images}
        main="poster"
        actions={
          <>
            {toPlay && (
              <PlayButtons
                kind="episode"
                id={toPlay.id}
                universe="series"
                position={!toPlay.userData?.played ? seconds(toPlay.userData?.position) : 0}
                label={episodeCode(toPlay)}
              />
            )}
            <PlayedButton
              itemId={s.id}
              played={Boolean(s.userData?.played)}
              label={t("actions.allWatched")}
            />
            <FavoriteButton itemId={s.id} favorite={Boolean(s.userData?.favorite)} />
            <ListButton itemId={s.id} what={t("what.series")} />
            <PartyButton itemId={s.id} />
            <DownloadAction itemId={s.id} what={t("what.series")} />
          </>
        }
      />
      {season && (
        <EpisodeList
          seasons={seasons.map((x) => ({ number: x.number, name: seasonName(x), unplayed: x.unplayedCount }))}
          current={season.number}
          onSeason={(n) => navigate({ search: { season: n }, replace: true, resetScroll: false })}
          unplayed={season.unplayedCount}
          markAll={<MarkAllButton itemId={season.id} played={season.unplayedCount === 0} />}
          episodes={episodes.data?.episodes ?? []}
          loading={episodes.isPending}
        />
      )}
      <Cast credits={s.credits} />
      <Similar itemId={s.id} />
    </div>
  );
}
