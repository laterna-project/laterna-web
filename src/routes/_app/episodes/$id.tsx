import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { formatRuntime, seconds } from "../../../api/media";
import { named } from "../../../api/text";
import {
  DownloadAction,
  FavoriteButton,
  ListButton,
  PartyButton,
  PlayButtons,
  PlayedButton,
} from "../../../features/catalog/actions";
import { Cast, creditLine, Files, Hero } from "../../../features/catalog/detail";
import { episodeNumber } from "../../../features/catalog/EpisodeList";
import { longDate } from "../../../features/catalog/format";
import styles from "../../../features/catalog/page.module.css";
import { CatalogService } from "../../../gen/laterna/v1/catalog_pb";
import { Alert } from "../../../ui/Alert";

export const Route = createFileRoute("/_app/episodes/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(CatalogService.method.getEpisode, { episodeId: params.id }, context),
    ),
  component: EpisodePage,
});

function EpisodePage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const query = useQuery(CatalogService.method.getEpisode, { episodeId: id });
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const e = query.data?.episode;
  if (!e) return null;
  const runtime = seconds(e.runtime);
  const credits = query.data?.credits ?? [];
  return (
    <div className={styles.page}>
      <Hero
        universe="series"
        breadcrumb={
          <Link
            to="/series/$id"
            params={{ id: e.seriesId }}
            search={{ season: e.seasonNumber }}
            className={styles.breadcrumb}
          >
            ← {e.seriesTitle}
          </Link>
        }
        chips={[
          t("catalog.season", { n: e.seasonNumber }),
          episodeNumber(e),
          e.premiereDate ? longDate(e.premiereDate) : "",
        ]}
        title={named(e.title, e.titleText)}
        overview={e.overview}
        line={[creditLine(credits), runtime > 0 ? formatRuntime(runtime) : ""].filter(Boolean).join(" · ")}
        images={e.images}
        main="thumb"
        userData={e.userData}
        runtime={runtime}
        actions={
          <>
            <PlayButtons
              kind="episode"
              id={e.id}
              universe="series"
              position={!e.userData?.played ? seconds(e.userData?.position) : 0}
            />
            <PlayedButton itemId={e.id} played={Boolean(e.userData?.played)} />
            <FavoriteButton itemId={e.id} favorite={Boolean(e.userData?.favorite)} />
            <ListButton itemId={e.id} what={t("what.episode")} />
            <PartyButton itemId={e.id} />
            <DownloadAction itemId={e.id} files={query.data?.files} what={t("what.episode")} />
          </>
        }
      />
      <div className={styles.columns}>
        <Cast credits={credits} />
        <Files files={query.data?.files ?? []} />
      </div>
    </div>
  );
}
