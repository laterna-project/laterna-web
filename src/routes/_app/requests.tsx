import { useInfiniteQuery, useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { requestFamily, requestKind, stateLabel } from "../../features/requests/requests";
import styles from "../../features/requests/requests.module.css";
import { Poster, RequestDialog, RequestRow, WatchLink } from "../../features/requests/ui";
import {
  type MediaRequest,
  RequestableState,
  type RequestableTitle,
  RequestKind,
  RequestService,
  RequestStatus,
} from "../../gen/laterna/v1/request_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Status } from "../../ui/Status";

type Kind = "series" | "movies" | "music" | "books";

/** Families of requests, each with its search: Sonarr, Radarr, Lidarr, LazyLibrarian. */
const kinds = [
  { id: "series", value: RequestKind.SERIES, label: "nav.series", placeholder: "requests.placeholderSeries" },
  { id: "movies", value: RequestKind.MOVIE, label: "nav.movies", placeholder: "requests.placeholderMovie" },
  { id: "music", value: RequestKind.MUSIC, label: "nav.music", placeholder: "requests.placeholderMusic" },
  { id: "books", value: RequestKind.BOOK, label: "nav.books", placeholder: "requests.placeholderBook" },
] as const;

export const Route = createFileRoute("/_app/requests")({
  validateSearch: (s: Record<string, unknown>): { q?: string; kind?: Kind } => ({
    ...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
    ...(kinds.some((k) => k.id === s.kind) ? { kind: s.kind as Kind } : {}),
  }),
  component: RequestsPage,
});

/**
 * Requests (server: docs/design/requests.md): search Sonarr, Radarr, Lidarr or LazyLibrarian for a
 * series, a movie, music or a book the libraries don't have, ask for it, and follow one's requests
 * until they can be watched, listened to or read.
 */
function RequestsPage() {
  const { t } = useTranslation();
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const account = session.account;
  const denied = Boolean(account?.denyRequests && !account.isAdmin);
  const destinations = useQuery(RequestService.method.listRequestDestinations, {}, { enabled: !denied });
  const open = kinds.filter((k) => destinations.data?.destinations.some((d) => d.kind === k.value));
  const kind = open.find((k) => k.id === search.kind) ?? open[0];
  const q = search.q ?? "";
  const [text, setText] = useState(q);
  const [asking, setAsking] = useState<RequestableTitle>();
  const [done, setDone] = useState("");

  // The address follows what is typed, once typing pauses: each search asks Sonarr or Radarr.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.trim() !== q)
        void navigate({ search: (s) => ({ ...s, q: text.trim() || undefined }), replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [text, q, navigate]);

  const results = useQuery(
    RequestService.method.searchRequestable,
    { kind: kind?.value, query: q },
    { enabled: Boolean(kind) && q.length >= 2, staleTime: 60_000 },
  );
  const mine = useInfiniteQuery(
    RequestService.method.listMyRequests,
    { pageSize: 30, pageToken: "" },
    {
      pageParamKey: "pageToken",
      getNextPageParam: (last) => last.nextPageToken || undefined,
      enabled: !denied,
    },
  );
  const requests = mine.data?.pages.flatMap((p) => p.requests) ?? [];
  const invalidate = useInvalidate();
  const cancel = useMutation(RequestService.method.cancelRequest, {
    onSuccess: () => invalidate(RequestService),
  });
  const quota = account && !account.isAdmin ? account.requestQuota : 0;

  const asked = (r: MediaRequest) => {
    setAsking(undefined);
    setDone(
      r.status === RequestStatus.PENDING
        ? t("requests.sent", { title: r.title })
        : t("requests.sentApproved", { title: r.title }),
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.head} data-ui="page-header">
        <h1 className={styles.pageTitle}>{t("requests.title")}</h1>
        <p className={styles.pageSub}>
          {quota > 0 ? t("requests.subtitleQuota", { count: quota }) : t("requests.subtitle")}
        </p>
      </div>

      {denied && <p className={styles.empty}>{t("requests.denied")}</p>}
      {destinations.isError && <Alert>{errorMessage(destinations.error)}</Alert>}
      {!denied && destinations.isSuccess && open.length === 0 && (
        <p className={styles.empty}>{t("requests.closed")}</p>
      )}

      {kind && (
        <section className={styles.section} aria-labelledby="request-search">
          <h2 id="request-search" className="sr-only">
            {t("requests.searchTitle")}
          </h2>
          {open.length > 1 && (
            <fieldset className={styles.choices}>
              <legend className="sr-only">{t("requests.kindLabel")}</legend>
              {open.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={styles.choice}
                  aria-pressed={k.id === kind.id}
                  onClick={() => navigate({ search: (s) => ({ ...s, kind: k.id }), replace: true })}
                >
                  <span
                    className={styles.dot}
                    style={{ background: `var(--color-${requestKind(k.value).universe})` }}
                  />
                  {t(k.label)}
                </button>
              ))}
            </fieldset>
          )}
          <search>
            <form className={styles.box} onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="request-query">
                <Icon name="search" size={24} />
                <span className="sr-only">{t("requests.searchLabel")}</span>
              </label>
              <input
                id="request-query"
                className={styles.input}
                type="search"
                autoComplete="off"
                placeholder={t(kind.placeholder)}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </form>
          </search>
          <Status className={styles.ok} message={done} />
          {results.isError && <Alert>{errorMessage(results.error)}</Alert>}
          {results.isFetching && !results.data && <p className={styles.muted}>{t("requests.searching")}</p>}
          {q.length >= 2 && results.data?.results.length === 0 && (
            <p className={styles.empty}>{t("requests.noResult", { q })}</p>
          )}
          {(results.data?.results.length ?? 0) > 0 && (
            <ul className={styles.results}>
              {results.data?.results.map((r) => (
                <Result
                  key={`${r.kind}-${r.externalId}`}
                  title={r}
                  onAsk={() => {
                    setDone("");
                    setAsking(r);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {!denied && requests.length > 0 && (
        <section className={styles.section} aria-labelledby="my-requests">
          <h2 id="my-requests" className={styles.sectionTitle}>
            {t("requests.mine")}
          </h2>
          {cancel.isError && <Alert>{errorMessage(cancel.error)}</Alert>}
          <ul className={styles.rows}>
            {requests.map((r) => (
              <RequestRow key={r.id} request={r}>
                {r.status === RequestStatus.PENDING && (
                  <Button
                    disabled={cancel.isPending}
                    aria-label={t("requests.withdrawLabel", { title: r.title })}
                    onClick={() => cancel.mutate({ requestId: r.id })}
                  >
                    {t("requests.withdraw")}
                  </Button>
                )}
              </RequestRow>
            ))}
          </ul>
          {mine.hasNextPage && (
            <div className={styles.actions}>
              <Button onClick={() => mine.fetchNextPage()} disabled={mine.isFetchingNextPage}>
                {t("common.seeMore")}
              </Button>
            </div>
          )}
        </section>
      )}
      {mine.isError && <Alert>{errorMessage(mine.error)}</Alert>}

      {asking && (
        <RequestDialog
          title={asking}
          destinations={
            destinations.data?.destinations.filter((d) => d.kind === requestFamily(asking.kind)) ?? []
          }
          onClose={() => setAsking(undefined)}
          onDone={asked}
        />
      )}
    </div>
  );
}

/** A search result: poster, title, a few words, and what can be done with it. */
function Result({ title: r, onAsk }: { title: RequestableTitle; onAsk: () => void }) {
  const { t } = useTranslation();
  const meta = [
    // An artist and an album look alike in a music search: their kind tells them apart.
    r.kind === RequestKind.ARTIST || r.kind === RequestKind.ALBUM ? requestKind(r.kind).label : "",
    r.network,
    r.year > 0 ? String(r.year) : "",
    r.kind === RequestKind.SERIES && r.seasonCount > 0
      ? t("requests.seasonCount", { count: r.seasonCount })
      : "",
  ].filter(Boolean);
  return (
    <li className={styles.result}>
      <Poster url={r.posterUrl} kind={r.kind} />
      <span className={styles.resultText}>
        <h3 className={styles.resultTitle}>{r.title}</h3>
        {meta.length > 0 && <span className={styles.muted}>{meta.join(" · ")}</span>}
        {r.overview && <span className={styles.overview}>{r.overview}</span>}
        <span className={styles.resultAction}>
          {r.state === RequestableState.REQUESTABLE ? (
            <Button variant="primary" onClick={onAsk} aria-label={t("requests.askLabel", { title: r.title })}>
              {t("requests.ask")}
            </Button>
          ) : (
            <span
              className={styles.pill}
              data-tone={r.state === RequestableState.AVAILABLE ? "ok" : undefined}
            >
              {stateLabel(r.state)}
            </span>
          )}
          {r.state === RequestableState.AVAILABLE && r.itemId && (
            <WatchLink kind={r.kind} itemId={r.itemId} />
          )}
        </span>
      </span>
    </li>
  );
}
