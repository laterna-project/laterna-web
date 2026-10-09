import { useMutation } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { mediaUrl } from "../../api/media";
import { serverText } from "../../api/text";
import {
  type MediaRequest,
  type RequestableTitle,
  type RequestDestination,
  RequestKind,
  RequestSeasons,
  RequestService,
  RequestStatus,
} from "../../gen/laterna/v1/request_pb";
import { locale } from "../../i18n";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { relativeTime } from "../catalog/format";
import { dateOf, requestKind, requestStatus, seasonsLabel } from "./requests";
import styles from "./requests.module.css";

/** Poster served by the server for a search result or a request; the universe color without one. */
export function Poster({ url, kind, size }: { url: string; kind: RequestKind; size?: "sm" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={styles.poster}
      data-size={size}
      style={{ background: `var(--color-${requestKind(kind).universe}-soft)` }}
    >
      {url && !failed && (
        <img src={mediaUrl(url)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

/** Link to the catalog item a request brought, once available. */
export function WatchLink({ kind, itemId }: { kind: RequestKind; itemId: string }) {
  const { t } = useTranslation();
  return kind === RequestKind.MOVIE ? (
    <Link to="/movies/$id" params={{ id: itemId }} className={styles.link}>
      {t("requests.watch")}
    </Link>
  ) : (
    <Link to="/series/$id" params={{ id: itemId }} className={styles.link}>
      {t("requests.watch")}
    </Link>
  );
}

/**
 * A request in a list: poster, title, seasons, where it stands (progress, reason of a decline or a
 * failure). who adds the requester (administration), children the actions.
 */
export function RequestRow({
  request: r,
  who,
  children,
}: {
  request: MediaRequest;
  who?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const status = requestStatus(r);
  const created = dateOf(r.createdAt);
  const kind = requestKind(r.kind);
  const meta = [
    kind.label,
    seasonsLabel(r),
    // The account's name only when the profile has another one.
    who
      ? r.profileName === r.username
        ? r.profileName
        : t("requests.by", { profile: r.profileName, account: r.username })
      : "",
    who && r.destination ? r.destination.name : "",
    created ? relativeTime(created) : "",
  ].filter(Boolean);
  return (
    <li className={styles.row}>
      <Poster url={r.posterUrl} kind={r.kind} size="sm" />
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>
          {r.title}
          {r.year > 0 && <span className={styles.muted}>({r.year})</span>}
          <span className={styles.pill} data-tone={status.tone}>
            {status.label}
          </span>
        </span>
        <span className={styles.rowMeta} title={created?.toLocaleString(locale())}>
          {meta.join(" · ")}
        </span>
        {r.status === RequestStatus.DOWNLOADING && (
          <span
            className={styles.progress}
            role="progressbar"
            aria-label={t("requests.progress", { title: r.title })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(r.progress * 100)}
          >
            <span className={styles.progressFill} style={{ width: `${Math.round(r.progress * 100)}%` }} />
          </span>
        )}
        {r.status === RequestStatus.DECLINED && r.declineReason && (
          <span className={styles.reason}>{t("requests.declineReason", { reason: r.declineReason })}</span>
        )}
        {r.status === RequestStatus.FAILED && (r.errorText || r.error) && (
          <span className={styles.reason}>{serverText(r.errorText) || r.error}</span>
        )}
        {r.status === RequestStatus.AVAILABLE && r.itemId && <WatchLink kind={r.kind} itemId={r.itemId} />}
      </span>
      {children && <span className={styles.rowActions}>{children}</span>}
    </li>
  );
}

const seasonChoices = [
  { value: RequestSeasons.ALL, label: "requests.seasons.all" },
  { value: RequestSeasons.FIRST, label: "requests.seasons.first" },
  { value: RequestSeasons.LATEST, label: "requests.seasons.latest" },
  { value: RequestSeasons.CHOSEN, label: "requests.seasons.pick" },
] as const;

/** Which seasons: the whole series, the first, the latest, or some of them. */
export function SeasonPicker({
  count,
  seasons,
  numbers,
  onChange,
}: {
  /** Seasons of the series, specials excluded (0 if unknown: no list to pick from). */
  count: number;
  seasons: RequestSeasons;
  numbers: readonly number[];
  onChange: (seasons: RequestSeasons, numbers: number[]) => void;
}) {
  const { t } = useTranslation();
  const toggle = (n: number) =>
    onChange(
      RequestSeasons.CHOSEN,
      numbers.includes(n) ? numbers.filter((x) => x !== n) : [...numbers, n].sort((a, b) => a - b),
    );
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.label}>{t("requests.seasonsLabel")}</legend>
      <div className={styles.choices}>
        {seasonChoices
          .filter((c) => c.value !== RequestSeasons.CHOSEN || count > 1)
          .map((c) => (
            <button
              key={c.value}
              type="button"
              className={styles.choice}
              aria-pressed={seasons === c.value}
              onClick={() => onChange(c.value, c.value === RequestSeasons.CHOSEN ? [...numbers] : [])}
            >
              {t(c.label)}
            </button>
          ))}
      </div>
      {seasons === RequestSeasons.CHOSEN && (
        <div className={styles.choices}>
          {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={styles.choice}
              aria-pressed={numbers.includes(n)}
              onClick={() => toggle(n)}
            >
              {t("requests.season", { number: n })}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** Where a request lands, when there is a choice. */
export function DestinationPicker({
  destinations,
  value,
  onChange,
}: {
  destinations: readonly RequestDestination[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (destinations.length < 2) return null;
  return (
    <label className={styles.fieldset}>
      <span className={styles.label}>{t("requests.destination")}</span>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {destinations.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} · {d.libraryName}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Asks for a title: seasons of a series, destination if there are several. */
export function RequestDialog({
  title,
  destinations,
  onClose,
  onDone,
}: {
  title: RequestableTitle;
  /** Destinations of the title's kind. */
  destinations: readonly RequestDestination[];
  onClose: () => void;
  onDone: (request: MediaRequest) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [seasons, setSeasons] = useState(RequestSeasons.ALL);
  const [numbers, setNumbers] = useState<number[]>([]);
  const [destination, setDestination] = useState(destinations[0]?.id ?? "");
  const create = useMutation(RequestService.method.createRequest, {
    onSuccess: async (res) => {
      await invalidate(RequestService);
      if (res.request) onDone(res.request);
    },
  });
  const series = title.kind === RequestKind.SERIES;
  const ready = !(seasons === RequestSeasons.CHOSEN && numbers.length === 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({
      kind: title.kind,
      externalId: title.externalId,
      destinationId: destinations.length > 1 ? destination : "",
      seasons,
      seasonNumbers: seasons === RequestSeasons.CHOSEN ? numbers : [],
    });
  };
  return (
    <Dialog title={t("requests.askTitle", { title: title.title })} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        {series && (
          <SeasonPicker
            count={title.seasonCount}
            seasons={seasons}
            numbers={numbers}
            onChange={(s, n) => {
              setSeasons(s);
              setNumbers(n);
            }}
          />
        )}
        <DestinationPicker destinations={destinations} value={destination} onChange={setDestination} />
        <p className={styles.muted}>{t("requests.askHint")}</p>
        {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
        <div className={styles.actions}>
          <span className={styles.spacer} />
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!ready || create.isPending} data-autofocus>
            {t("requests.ask")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
