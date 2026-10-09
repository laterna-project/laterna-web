// Requests for movies and series (server: docs/design/requests.md): what a request is, in plain
// words, for the profile that made it and for the administrators.
import type { Timestamp } from "@bufbuild/protobuf/wkt";
import {
  type MediaRequest,
  RequestableState,
  RequestKind,
  RequestSeasons,
  RequestSeriesType,
  RequestStatus,
} from "../../gen/laterna/v1/request_pb";
import i18n, { num } from "../../i18n";
import type { Universe } from "../../theme/contract";

/** Tone of a status pill: done, waiting, refused. */
export type Tone = "ok" | "warn" | undefined;

/** A request's status in words, with its tone. */
export function requestStatus(
  r: Pick<MediaRequest, "status" | "progress" | "kind" | "episodesAvailable" | "episodesWanted">,
): {
  label: string;
  tone: Tone;
} {
  switch (r.status) {
    case RequestStatus.PENDING:
      return { label: i18n.t("requests.status.pending"), tone: undefined };
    case RequestStatus.APPROVED:
      return { label: i18n.t("requests.status.approved"), tone: undefined };
    case RequestStatus.DOWNLOADING:
      return {
        label: i18n.t("requests.status.downloading", { percent: num(r.progress, { style: "percent" }) }),
        tone: undefined,
      };
    case RequestStatus.AVAILABLE:
      // A series arrives episode by episode: available from the first one.
      if (r.kind === RequestKind.SERIES && r.episodesWanted > 0 && r.episodesAvailable < r.episodesWanted)
        return {
          label: i18n.t("requests.status.episodes", { have: r.episodesAvailable, want: r.episodesWanted }),
          tone: "ok",
        };
      return { label: i18n.t("requests.status.available"), tone: "ok" };
    case RequestStatus.DECLINED:
      return { label: i18n.t("requests.status.declined"), tone: "warn" };
    case RequestStatus.FAILED:
      return { label: i18n.t("requests.status.failed"), tone: "warn" };
    default:
      return { label: "", tone: undefined };
  }
}

/** Seasons asked for, in words; empty for a movie. */
export function seasonsLabel(r: Pick<MediaRequest, "kind" | "seasons" | "seasonNumbers">): string {
  if (r.kind !== RequestKind.SERIES) return "";
  switch (r.seasons) {
    case RequestSeasons.FIRST:
      return i18n.t("requests.seasons.first");
    case RequestSeasons.LATEST:
      return i18n.t("requests.seasons.latest");
    case RequestSeasons.CHOSEN:
      return i18n.t("requests.seasons.chosen", {
        count: r.seasonNumbers.length,
        seasons: r.seasonNumbers.join(", "),
      });
    default:
      return i18n.t("requests.seasons.all");
  }
}

/** Kind of a request in words, and its universe. */
export function requestKind(kind: RequestKind): { label: string; universe: Universe } {
  return kind === RequestKind.MOVIE
    ? { label: i18n.t("requests.kind.movie"), universe: "movies" }
    : { label: i18n.t("requests.kind.series"), universe: "series" };
}

/** A search result's state in words; empty when it can be requested. */
export function stateLabel(state: RequestableState): string {
  switch (state) {
    case RequestableState.AVAILABLE:
      return i18n.t("requests.state.available");
    case RequestableState.REQUESTED:
      return i18n.t("requests.state.requested");
    case RequestableState.TRACKED:
      return i18n.t("requests.state.tracked");
    default:
      return "";
  }
}

/** Series types of Sonarr, for a destination. */
export const seriesTypes = [
  { value: RequestSeriesType.STANDARD, label: "requests.seriesType.standard" },
  { value: RequestSeriesType.ANIME, label: "requests.seriesType.anime" },
  { value: RequestSeriesType.DAILY, label: "requests.seriesType.daily" },
] as const;

/** Statuses a request can still be decided in (approved or declined). */
export function decidable(status: RequestStatus): boolean {
  return status === RequestStatus.PENDING || status === RequestStatus.FAILED;
}

export function dateOf(ts: Timestamp | undefined): Date | undefined {
  return ts ? new Date(Number(ts.seconds) * 1000) : undefined;
}
