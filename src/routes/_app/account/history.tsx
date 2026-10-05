import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useInfiniteQuery, useMutation } from "@connectrpc/connect-query";
import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import { ImageKind, pickImage, seconds } from "../../../api/media";
import styles from "../../../features/stats/history.module.css";
import { hoursLabel } from "../../../features/stats/stats";
import { type HistoryEntry, HistoryKind, HistoryService } from "../../../gen/laterna/v1/history_pb";
import { locale } from "../../../i18n";
import type { Universe } from "../../../theme/contract";
import { Alert } from "../../../ui/Alert";
import { Artwork } from "../../../ui/Artwork";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Status } from "../../../ui/Status";

export const Route = createFileRoute("/_app/account/history")({
  component: HistoryPage,
});

const dayLabel = (d: Parameters<typeof timestampDate>[0]) =>
  new Intl.DateTimeFormat(locale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(timestampDate(d));
const timeLabel = (d: Parameters<typeof timestampDate>[0]) =>
  new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" }).format(timestampDate(d));

/** Detail page of a session's item if it still exists; nothing otherwise (the title stays). */
function entryLink(e: HistoryEntry): LinkProps | undefined {
  switch (e.item.case) {
    case "movie":
      return { to: "/movies/$id", params: { id: e.item.value.id } };
    case "episode":
      return { to: "/episodes/$id", params: { id: e.item.value.id } };
    case "track":
      return e.item.value.albumId
        ? { to: "/music/albums/$id", params: { id: e.item.value.albumId } }
        : undefined;
    default:
      return undefined;
  }
}

function entryUniverse(kind: HistoryKind): Universe {
  return kind === HistoryKind.MOVIE ? "movies" : kind === HistoryKind.EPISODE ? "series" : "music";
}

function entryImage(e: HistoryEntry) {
  switch (e.item.case) {
    case "movie":
      return pickImage(e.item.value.images, ImageKind.BACKDROP, ImageKind.THUMB, ImageKind.POSTER);
    case "episode":
      return pickImage(e.item.value.images, ImageKind.THUMB, ImageKind.BACKDROP);
    case "track":
      return pickImage(e.item.value.images, ImageKind.POSTER);
    default:
      return undefined;
  }
}

/** Sessions grouped by start day, in the server's order (most recent first). */
function byDay(entries: readonly HistoryEntry[]): { day: string; entries: HistoryEntry[] }[] {
  const groups: { day: string; entries: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const day = e.startedAt ? dayLabel(e.startedAt) : "";
    const last = groups.at(-1);
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }
  return groups;
}

/** History: each playback session of the profile, which can be deleted one by one or all at once. */
function HistoryPage() {
  const { t } = useTranslation();
  const { profile } = Route.useRouteContext();
  const invalidate = useInvalidate();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");
  const history = useInfiniteQuery(
    HistoryService.method.listHistory,
    { pageSize: 50, pageToken: "" },
    { pageParamKey: "pageToken", getNextPageParam: (last) => last.nextPageToken || undefined },
  );
  const remove = useMutation(HistoryService.method.deleteHistoryEntry, {
    onSuccess: () => {
      setDone(t("history.deleted"));
      return invalidate(HistoryService);
    },
  });
  const clear = useMutation(HistoryService.method.clearHistory, {
    onSuccess: (res) => {
      setConfirm(false);
      setDone(t("history.cleared", { count: Number(res.deleted) }));
      return invalidate(HistoryService);
    },
  });
  const entries = history.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <>
      <div className={styles.head} data-ui="page-header">
        <div className={styles.headText}>
          <h1 className={styles.title}>{t("history.title")}</h1>
          <p className={styles.subtitle}>{t("history.subtitle", { name: profile.name })}</p>
        </div>
        {entries.length > 0 && (
          <button type="button" className={styles.danger} onClick={() => setConfirm(true)}>
            {t("history.clearAll")}
          </button>
        )}
      </div>
      {history.isError && <Alert>{errorMessage(history.error)}</Alert>}
      {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
      <Status className={styles.meta} message={done} />
      {history.isSuccess && entries.length === 0 && <p className={styles.empty}>{t("history.empty")}</p>}
      {byDay(entries).map((g) => (
        <section key={g.day} className={styles.card} aria-label={g.day}>
          <h2 className={styles.day}>{g.day.charAt(0).toUpperCase() + g.day.slice(1)}</h2>
          <ul className={styles.list}>
            {g.entries.map((e) => (
              <Entry
                key={e.id}
                entry={e}
                pending={remove.isPending}
                onDelete={() => remove.mutate({ entryId: e.id })}
              />
            ))}
          </ul>
        </section>
      ))}
      {history.hasNextPage && (
        <div className={styles.actions}>
          <Button onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
            {t("common.seeMore")}
          </Button>
        </div>
      )}
      {confirm && (
        <Dialog title={t("history.confirmTitle")} onClose={() => setConfirm(false)}>
          <p>{t("history.confirmText", { name: profile.name })}</p>
          {clear.isError && <Alert>{errorMessage(clear.error)}</Alert>}
          <div className={styles.actions}>
            <Button onClick={() => setConfirm(false)} data-autofocus>
              {t("common.keep")}
            </Button>
            <button
              type="button"
              className={styles.danger}
              disabled={clear.isPending}
              onClick={() => clear.mutate({})}
            >
              {t("history.clearAll")}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function Entry({
  entry: e,
  pending,
  onDelete,
}: {
  entry: HistoryEntry;
  pending: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const link = entryLink(e);
  const started = e.startedAt ? timeLabel(e.startedAt) : "";
  const meta = [
    e.subtitle,
    t(e.kind === HistoryKind.TRACK ? "history.listened" : "history.watched", {
      time: hoursLabel(seconds(e.watched)),
    }),
    started && t("history.at", { time: started }),
    e.device,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className={styles.entry}>
      <Artwork
        image={entryImage(e)}
        sizes="96px"
        ratio={e.kind === HistoryKind.TRACK ? 1 : 16 / 9}
        universe={entryUniverse(e.kind)}
        fallback={e.title.slice(0, 1)}
        className={styles.art}
      />
      <span className={styles.text}>
        <span>
          {link ? (
            <Link {...link} className={styles.name}>
              {e.title}
            </Link>
          ) : (
            <span className={styles.name}>{e.title}</span>
          )}
          {e.completed && <span className={styles.tag}>{t("history.completed")}</span>}
          {e.offline && <span className={styles.tag}>{t("history.offline")}</span>}
        </span>
        <span className={styles.meta}>{meta}</span>
      </span>
      <button
        type="button"
        className={styles.small}
        disabled={pending}
        aria-label={t("history.deleteLabel", { title: e.title })}
        onClick={onDelete}
      >
        {t("history.delete")}
      </button>
    </li>
  );
}
