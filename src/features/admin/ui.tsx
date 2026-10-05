import { useMutation, useQuery } from "@connectrpc/connect-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { serverText } from "../../api/text";
import { type ActivityEntry, ActivityService } from "../../gen/laterna/v1/activity_pb";
import { SystemService } from "../../gen/laterna/v1/system_pb";
import { locale } from "../../i18n";
import { Alert } from "../../ui/Alert";
import { activityTone, jobName, type Tag } from "./admin";
import styles from "./admin.module.css";

/** Header of an administration page: title, secondary line, actions. */
export function AdminHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={styles.head} data-ui="page-header">
      <div>
        <h1 className={styles.title}>{title}</h1>
        {sub && <p className={styles.sub}>{sub}</p>}
      </div>
      {children && <div className={styles.headActions}>{children}</div>}
    </header>
  );
}

export function Tags({ tags }: { tags: readonly Tag[] }) {
  return (
    <span className={styles.tags}>
      {tags.map((t) => (
        <span key={t.label} className={styles.tag} data-tone={t.tone}>
          {t.label}
        </span>
      ))}
    </span>
  );
}

/** Color dot of a universe, or of an alert. */
export function toneColor(tone: string): string {
  return tone === "danger" ? "var(--color-danger)" : `var(--color-${tone})`;
}

const timeOf = (d: Date, now = new Date()) =>
  d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(locale(), { day: "numeric", month: "short" });

/** An activity log entry: time, color, the server's sentence. */
export function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const at = entry.at ? new Date(Number(entry.at.seconds) * 1000) : undefined;
  return (
    <li className={styles.activity} data-warning={entry.warning || undefined}>
      <time className={styles.activityAt} dateTime={at?.toISOString()} title={at?.toLocaleString(locale())}>
        {at ? timeOf(at) : ""}
      </time>
      <span
        className={styles.dot}
        style={{ background: toneColor(activityTone(entry.kind, entry.warning)) }}
      />
      <span className={styles.activityText}>{serverText(entry.text) || entry.summary}</span>
    </li>
  );
}

/** Latest entries of the activity log (overview). */
export function RecentActivity({ count }: { count: number }) {
  const { t } = useTranslation();
  const activity = useQuery(
    ActivityService.method.listActivity,
    { pageSize: count },
    { refetchInterval: 15_000 },
  );
  const entries = activity.data?.entries ?? [];
  return (
    <ul className={styles.activityList}>
      {entries.map((e) => (
        <ActivityRow key={String(e.id)} entry={e} />
      ))}
      {activity.isSuccess && entries.length === 0 && (
        <li className={styles.muted}>{t("jobsUi.nothingYet")}</li>
      )}
    </ul>
  );
}

/**
 * Permanently failed jobs: kind, target, error; retry or forget, one by one or all. limit shortens
 * the list (overview).
 */
export function FailedJobs({ limit }: { limit?: number }) {
  const { t } = useTranslation();
  const jobs = useQuery(SystemService.method.listJobs, {}, { refetchInterval: 10_000 });
  const invalidate = useInvalidate();
  const done = () => invalidate(SystemService);
  const retry = useMutation(SystemService.method.retryJobs, { onSuccess: done });
  const forget = useMutation(SystemService.method.deleteJobs, { onSuccess: done });
  const failed = jobs.data?.failed ?? [];
  const shown = limit ? failed.slice(0, limit) : failed;
  const busy = retry.isPending || forget.isPending;
  const error = retry.error ?? forget.error ?? jobs.error;
  return (
    <>
      {error && <Alert>{errorMessage(error)}</Alert>}
      {jobs.isSuccess && failed.length === 0 && <p className={styles.muted}>{t("jobsUi.noneFailed")}</p>}
      <ul className={styles.failedList}>
        {shown.map((f) => (
          <li key={String(f.id)} className={styles.failed}>
            <span className={styles.failedText}>
              <span className={styles.failedWhat}>
                <span className={styles.failedKind}>{jobName(f.kind)}</span>
                {f.label && <> · {f.label}</>}
              </span>
              <span className={styles.failedError}>
                {t("jobsUi.tries", { count: f.attempts })} · {f.lastError}
              </span>
            </span>
            {!limit && (
              <span className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.small}
                  disabled={busy}
                  onClick={() => retry.mutate({ ids: [f.id] })}
                  aria-label={t("jobsUi.retryLabel", { name: jobName(f.kind) })}
                >
                  {t("jobsUi.retry")}
                </button>
                <button
                  type="button"
                  className={styles.small}
                  disabled={busy}
                  onClick={() => forget.mutate({ ids: [f.id] })}
                  aria-label={t("jobsUi.forgetLabel", { name: jobName(f.kind) })}
                >
                  {t("jobsUi.forget")}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {failed.length > 0 && (
        <div className={styles.actions}>
          <button type="button" className={styles.dark} disabled={busy} onClick={() => retry.mutate({})}>
            {t("jobsUi.retryAll")}
          </button>
          <button type="button" className={styles.small} disabled={busy} onClick={() => forget.mutate({})}>
            {t("jobsUi.forgetAll")}
          </button>
          {limit !== undefined && failed.length > limit && (
            <span className={styles.muted}>{t("jobsUi.more", { count: failed.length - limit })}</span>
          )}
        </div>
      )}
    </>
  );
}
