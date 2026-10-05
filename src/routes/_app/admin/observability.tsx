import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import { serverUrl } from "../../../api/transport";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead } from "../../../features/admin/ui";
import { SystemService } from "../../../gen/laterna/v1/system_pb";
import { Alert } from "../../../ui/Alert";
import { Status } from "../../../ui/Status";
import { Switch } from "../../../ui/Switch";

export const Route = createFileRoute("/_app/admin/observability")({
  component: Observability,
});

/**
 * Observability (server: docs/design/operations.md): metrics in the Prometheus format, opened by a
 * dedicated token; OpenTelemetry traces configured by the environment.
 */
function Observability() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const metrics = useQuery(SystemService.method.getMetrics, {});
  const publicUrl = useQuery(SystemService.method.getSettings, {}).data?.settings?.publicUrl;
  const [token, setToken] = useState("");
  const [done, setDone] = useState("");
  const enable = useMutation(SystemService.method.enableMetrics, {
    onSuccess: async (res) => {
      setToken(res.token);
      setDone(t("adminObs.opened"));
      await invalidate(SystemService);
    },
  });
  const disable = useMutation(SystemService.method.disableMetrics, {
    onSuccess: async () => {
      setToken("");
      setDone(t("adminObs.closed"));
      await invalidate(SystemService);
    },
  });
  const on = Boolean(metrics.data?.enabled);
  const path = metrics.data?.path || "/metrics";
  const target = new URL(publicUrl || serverUrl());
  const busy = enable.isPending || disable.isPending;

  return (
    <>
      <AdminHead title={t("adminObs.title")} sub={t("adminObs.subtitle")} />
      {metrics.isError && <Alert>{errorMessage(metrics.error)}</Alert>}
      <div className={styles.grid2}>
        <section className={styles.card} aria-labelledby="metrics">
          <h2 id="metrics" className={styles.cardTitle}>
            {t("adminObs.metrics")}
          </h2>
          <p className={styles.muted}>{t("adminObs.metricsText")}</p>
          <Switch
            label={t("adminObs.expose")}
            hint={on ? t("adminObs.exposeOn", { path }) : t("adminObs.exposeOff")}
            on={on}
            disabled={busy || metrics.isPending}
            onChange={(next) => {
              setDone("");
              if (next) enable.mutate({});
              else disable.mutate({});
            }}
          />
          {(enable.isError || disable.isError) && (
            <Alert>{errorMessage(enable.error ?? disable.error)}</Alert>
          )}
          <Status className={styles.ok} message={done} />
          {token && (
            <div className={styles.secret}>
              {t("adminObs.tokenFor")}
              <span className={styles.copyRow}>
                <code className={styles.code}>{token}</code>
                <button
                  type="button"
                  className={styles.small}
                  onClick={() =>
                    void navigator.clipboard?.writeText(token).then(() => setDone(t("adminObs.tokenCopied")))
                  }
                >
                  {t("common.copy")}
                </button>
              </span>
            </div>
          )}
          {on && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.small}
                disabled={busy}
                onClick={() => enable.mutate({})}
              >
                {t("adminObs.newToken")}
              </button>
              <span className={styles.muted}>{t("adminObs.oldInvalid")}</span>
            </div>
          )}
          <pre className={styles.pre}>{`scrape_configs:
  - job_name: laterna
    scheme: ${target.protocol.replace(":", "")}
    metrics_path: ${path}
    authorization:
            credentials: "${token || t("adminObs.tokenPlaceholder")}"
    static_configs:
      - targets: ["${target.host}"]`}</pre>
        </section>
        <section className={styles.card} aria-labelledby="traces">
          <h2 id="traces" className={styles.cardTitle}>
            {t("adminObs.traces")}
          </h2>
          <p>{t("adminObs.tracesText")}</p>
          <p className={styles.muted}>{t("adminObs.tracesConfig")}</p>
          <pre className={styles.pre}>{`OTEL_EXPORTER_OTLP_ENDPOINT=http://${t("adminObs.collector")}:4318
OTEL_SERVICE_NAME=laterna
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1`}</pre>
          <p className={styles.muted}>
            <Trans i18nKey="adminObs.traceId" components={{ code: <code /> }} />
          </p>
        </section>
      </div>
    </>
  );
}
