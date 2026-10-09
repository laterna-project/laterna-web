import { useInfiniteQuery, useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import styles from "../../../features/admin/admin.module.css";
import { RequestDestinations } from "../../../features/admin/RequestDestinations";
import { AdminHead } from "../../../features/admin/ui";
import { decidable, seasonsLabel } from "../../../features/requests/requests";
import { DestinationPicker, RequestRow } from "../../../features/requests/ui";
import { ActivityService } from "../../../gen/laterna/v1/activity_pb";
import {
  type MediaRequest,
  type RequestDestination,
  RequestKind,
  RequestSeasons,
  RequestService,
  RequestStatus,
} from "../../../gen/laterna/v1/request_pb";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";

type Filter = "pending" | "active" | "done" | "all";

const filters = [
  { id: "pending", label: "adminRequests.filters.pending", statuses: [RequestStatus.PENDING] },
  {
    id: "active",
    label: "adminRequests.filters.active",
    statuses: [RequestStatus.APPROVED, RequestStatus.DOWNLOADING, RequestStatus.FAILED],
  },
  {
    id: "done",
    label: "adminRequests.filters.done",
    statuses: [RequestStatus.AVAILABLE, RequestStatus.DECLINED],
  },
  { id: "all", label: "adminRequests.filters.all", statuses: [] },
] as const satisfies readonly { id: Filter; label: string; statuses: readonly RequestStatus[] }[];

export const Route = createFileRoute("/_app/admin/requests")({
  validateSearch: (s: Record<string, unknown>): { show?: Filter } =>
    filters.some((f) => f.id === s.show) ? { show: s.show as Filter } : {},
  component: AdminRequests,
});

/**
 * Requests of every profile (server: docs/design/requests.md): approve them (in another destination
 * or for other seasons if need be), decline them with a reason, forget them; and where they land.
 */
function AdminRequests() {
  const { t } = useTranslation();
  const { show = "pending" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filter = filters.find((f) => f.id === show) ?? filters[0];
  const list = useInfiniteQuery(
    RequestService.method.listRequests,
    { statuses: [...filter.statuses], pageSize: 50, pageToken: "" },
    { pageParamKey: "pageToken", getNextPageParam: (last) => last.nextPageToken || undefined },
  );
  const requests = list.data?.pages.flatMap((p) => p.requests) ?? [];
  const pending = list.data?.pages[0]?.pendingCount ?? 0;
  const destinations = useQuery(RequestService.method.listRequestDestinations, {}).data?.destinations ?? [];
  const invalidate = useInvalidate();
  const refresh = () => invalidate(RequestService, ActivityService);
  const [approving, setApproving] = useState<MediaRequest>();
  const [declining, setDeclining] = useState<MediaRequest>();
  const remove = useMutation(RequestService.method.deleteRequest, { onSuccess: refresh });

  return (
    <>
      <AdminHead
        title={t("adminRequests.title")}
        sub={pending > 0 ? t("adminRequests.pending", { count: pending }) : t("adminRequests.subtitle")}
      />
      <fieldset className={styles.choices}>
        <legend className="sr-only">{t("adminRequests.filterLabel")}</legend>
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={styles.choice}
            aria-pressed={f.id === filter.id}
            onClick={() => navigate({ search: f.id === "pending" ? {} : { show: f.id }, replace: true })}
          >
            {t(f.label)}
          </button>
        ))}
      </fieldset>
      <section className={styles.card} aria-label={t(filter.label)}>
        {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
        {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
        {list.isSuccess && requests.length === 0 && (
          <p className={styles.muted}>{t("common.nothingToShow")}</p>
        )}
        <ul className={styles.rows}>
          {requests.map((r) => (
            <RequestRow key={r.id} request={r} who>
              {decidable(r.status) && (
                <>
                  <button
                    type="button"
                    className={styles.dark}
                    aria-label={t("adminRequests.approveLabel", { title: r.title })}
                    onClick={() => setApproving(r)}
                  >
                    {t("adminRequests.approve")}
                  </button>
                  <button
                    type="button"
                    className={styles.small}
                    aria-label={t("adminRequests.declineLabel", { title: r.title })}
                    onClick={() => setDeclining(r)}
                  >
                    {t("adminRequests.decline")}
                  </button>
                </>
              )}
              {!decidable(r.status) && (
                <button
                  type="button"
                  className={styles.small}
                  disabled={remove.isPending}
                  aria-label={t("adminRequests.forgetLabel", { title: r.title })}
                  onClick={() => remove.mutate({ requestId: r.id })}
                >
                  {t("adminRequests.forget")}
                </button>
              )}
            </RequestRow>
          ))}
        </ul>
        {list.hasNextPage && (
          <div className={styles.actions}>
            <Button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              {t("common.seeMore")}
            </Button>
          </div>
        )}
      </section>
      <RequestDestinations />
      {approving && (
        <ApproveDialog
          request={approving}
          destinations={destinations.filter((d) => d.kind === approving.kind)}
          onClose={() => setApproving(undefined)}
          onDone={async () => {
            setApproving(undefined);
            await refresh();
          }}
        />
      )}
      {declining && (
        <DeclineDialog
          request={declining}
          onClose={() => setDeclining(undefined)}
          onDone={async () => {
            setDeclining(undefined);
            await refresh();
          }}
        />
      )}
    </>
  );
}

const seasonChoices = [
  { value: RequestSeasons.ALL, label: "requests.seasons.all" },
  { value: RequestSeasons.FIRST, label: "requests.seasons.first" },
  { value: RequestSeasons.LATEST, label: "requests.seasons.latest" },
] as const;

/** Approves a request, in its destination or another one, for the seasons asked or others. */
function ApproveDialog({
  request: r,
  destinations,
  onClose,
  onDone,
}: {
  request: MediaRequest;
  destinations: readonly RequestDestination[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState(r.destination?.id ?? destinations[0]?.id ?? "");
  // UNSPECIFIED keeps the seasons asked for.
  const [seasons, setSeasons] = useState(RequestSeasons.UNSPECIFIED);
  const approve = useMutation(RequestService.method.approveRequest, { onSuccess: onDone });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    approve.mutate({
      requestId: r.id,
      destinationId: destination !== r.destination?.id ? destination : undefined,
      seasons,
    });
  };
  return (
    <Dialog title={t("adminRequests.approveTitle", { title: r.title })} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        {r.kind === RequestKind.SERIES && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>{t("requests.seasonsLabel")}</legend>
            <div className={styles.choices}>
              <button
                type="button"
                className={styles.choice}
                aria-pressed={seasons === RequestSeasons.UNSPECIFIED}
                onClick={() => setSeasons(RequestSeasons.UNSPECIFIED)}
              >
                {t("adminRequests.asAsked", { seasons: seasonsLabel(r) })}
              </button>
              {seasonChoices
                .filter((c) => c.value !== r.seasons)
                .map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={styles.choice}
                    aria-pressed={seasons === c.value}
                    onClick={() => setSeasons(c.value)}
                  >
                    {t(c.label)}
                  </button>
                ))}
            </div>
          </fieldset>
        )}
        <DestinationPicker destinations={destinations} value={destination} onChange={setDestination} />
        {destinations.length === 0 && <p className={styles.warn}>{t("adminRequests.noDestination")}</p>}
        <p className={styles.muted}>{t("adminRequests.approveHint")}</p>
        {approve.isError && <Alert>{errorMessage(approve.error)}</Alert>}
        <div className={styles.actions}>
          <span className={styles.spacer} />
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={approve.isPending || !destination} data-autofocus>
            {t("adminRequests.approve")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Declines a request, with a reason the requester reads. */
function DeclineDialog({
  request: r,
  onClose,
  onDone,
}: {
  request: MediaRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const decline = useMutation(RequestService.method.declineRequest, { onSuccess: onDone });
  return (
    <Dialog title={t("adminRequests.declineTitle", { title: r.title })} onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          decline.mutate({ requestId: r.id, reason: reason.trim() });
        }}
      >
        <label className={styles.selectField}>
          <span className={styles.label}>{t("adminRequests.reason")}</span>
          <textarea
            className={styles.textarea}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-autofocus
          />
        </label>
        <p className={styles.muted}>{t("adminRequests.reasonHint", { profile: r.profileName })}</p>
        {decline.isError && <Alert>{errorMessage(decline.error)}</Alert>}
        <div className={styles.actions}>
          <span className={styles.spacer} />
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={decline.isPending}>
            {t("adminRequests.decline")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
