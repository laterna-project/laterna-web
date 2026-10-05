import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { formatRating, formatRuntime, seconds } from "../../../api/media";
import {
  DownloadAction,
  FavoriteButton,
  ListButton,
  PartyButton,
  PlayButtons,
  PlayedButton,
} from "../../../features/catalog/actions";
import { Cast, creditLine, Files, Hero, Similar } from "../../../features/catalog/detail";
import styles from "../../../features/catalog/page.module.css";
import { CatalogService } from "../../../gen/laterna/v1/catalog_pb";
import { num } from "../../../i18n";
import { Alert } from "../../../ui/Alert";

export const Route = createFileRoute("/_app/movies/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(CatalogService.method.getMovie, { movieId: params.id }, context),
    ),
  component: MoviePage,
});

function MoviePage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const query = useQuery(CatalogService.method.getMovie, { movieId: id });
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const m = query.data?.movie;
  if (!m) return null;
  const runtime = seconds(m.runtime);
  const line = [
    creditLine(m.credits),
    m.studios.slice(0, 2).join(", "),
    runtime > 0 ? formatRuntime(runtime) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={styles.page}>
      <Hero
        universe="movies"
        chips={[
          t("catalog.movie"),
          m.year ? String(m.year) : "",
          m.officialRating ? formatRating(m.officialRating) : "",
          m.genres.slice(0, 3).join(" · "),
          m.communityRating > 0
            ? t("catalog.rating", { value: num(m.communityRating, { maximumFractionDigits: 1 }) })
            : "",
        ]}
        title={m.title}
        originalTitle={m.originalTitle}
        tagline={m.tagline}
        overview={m.overview}
        line={line}
        images={m.images}
        main="poster"
        userData={m.userData}
        runtime={runtime}
        actions={
          <>
            <PlayButtons
              kind="film"
              id={m.id}
              universe="movies"
              position={!m.userData?.played ? seconds(m.userData?.position) : 0}
            />
            <PlayedButton itemId={m.id} played={Boolean(m.userData?.played)} />
            <FavoriteButton itemId={m.id} favorite={Boolean(m.userData?.favorite)} />
            <ListButton itemId={m.id} what={t("what.movie")} />
            <PartyButton itemId={m.id} />
            <DownloadAction itemId={m.id} files={query.data?.files} what={t("what.movie")} />
          </>
        }
      />
      {m.collections.length > 0 && (
        <p className={styles.collections}>
          {t("catalog.partOf")}
          {m.collections.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <strong>{c.name}</strong>
            </span>
          ))}
        </p>
      )}
      <div className={styles.columns}>
        <Cast credits={m.credits} />
        <Files files={query.data?.files ?? []} />
      </div>
      <Similar itemId={m.id} />
    </div>
  );
}
