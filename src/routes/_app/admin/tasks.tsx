import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { jobName } from "../../../features/admin/admin";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead, FailedJobs } from "../../../features/admin/ui";
import { SystemService } from "../../../gen/laterna/v1/system_pb";
import { Alert } from "../../../ui/Alert";

export const Route = createFileRoute("/_app/admin/tasks")({
  component: Jobs,
});

/** The server's job queue: counts by kind, failed jobs to retry or forget. */
function Jobs() {
  const { t } = useTranslation();
  const jobs = useQuery(SystemService.method.listJobs, {}, { refetchInterval: 5000 });
  const counts = jobs.data?.counts ?? [];
  const kinds = [...new Set(counts.map((c) => c.kind))].sort();
  const n = (kind: string, state: string) =>
    counts.find((c) => c.kind === kind && c.state === state)?.count ?? 0;

  return (
    <>
      <AdminHead title={t("adminTasks.title")} sub={t("adminTasks.subtitle")} />
      {jobs.isError && <Alert>{errorMessage(jobs.error)}</Alert>}
      <div className={styles.grid2}>
        <section className={styles.card} aria-labelledby="failures">
          <h2 id="failures" className={styles.cardTitle}>
            {t("adminTasks.failed")}
          </h2>
          <FailedJobs />
        </section>
        <section className={styles.card} aria-labelledby="queue">
          <h2 id="queue" className={styles.cardTitle}>
            {t("adminTasks.queue")}
          </h2>
          {jobs.isSuccess && kinds.length === 0 ? (
            <p className={styles.muted}>{t("adminTasks.idle")}</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t("adminTasks.kind")}</th>
                  <th scope="col">{t("adminTasks.pending")}</th>
                  <th scope="col">{t("adminTasks.running")}</th>
                  <th scope="col">{t("adminTasks.failedCol")}</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map((k) => (
                  <tr key={k}>
                    <th scope="row">
                      {jobName(k)} <span className={styles.code}>{k}</span>
                    </th>
                    <td>{n(k, "pending")}</td>
                    <td>{n(k, "running")}</td>
                    <td data-tone={n(k, "failed") ? "danger" : undefined}>{n(k, "failed")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
