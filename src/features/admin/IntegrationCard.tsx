import { useMutation } from "@connectrpc/connect-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { type Integration, IntegrationService } from "../../gen/laterna/v1/integration_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Status } from "../../ui/Status";
import { integrationName, integrationState } from "./admin";
import styles from "./admin.module.css";

/**
 * Sonarr or Radarr: address and API key tried then saved, checks, settings made for Laterna,
 * removal.
 */
export function IntegrationCard({
  integration: i,
  laternaUrl,
}: {
  integration: Integration;
  laternaUrl: string;
}) {
  const { t } = useTranslation();
  const { name, what, port } = integrationName(i.kind);
  const state = integrationState(i);
  const invalidate = useInvalidate();
  const [url, setUrl] = useState(i.url);
  const [apiKey, setApiKey] = useState("");
  const [done, setDone] = useState("");
  const refresh = (message: string) => async () => {
    await invalidate(IntegrationService);
    setDone(message);
  };
  const link = useMutation(IntegrationService.method.setIntegration, {
    onSuccess: refresh(t("adminArr.linked", { name })),
  });
  const configure = useMutation(IntegrationService.method.configureIntegration, {
    onSuccess: async (_, req) => {
      await invalidate(IntegrationService);
      setDone(
        req.refresh
          ? t("adminArr.refreshing", { name, what })
          : req.webhookUrl
            ? t("adminArr.webhookInstalled", { name })
            : t("adminArr.kodiEnabled"),
      );
    },
  });
  const forget = useMutation(IntegrationService.method.deleteIntegration, {
    onSuccess: refresh(t("adminArr.forgotten", { name })),
  });
  const busy = link.isPending || configure.isPending || forget.isPending;
  const error = link.error ?? configure.error ?? forget.error;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone("");
    link.mutate({ kind: i.kind, url: url.trim(), apiKey: apiKey.trim() });
  };
  const act = (fields: { kodiMetadata?: boolean; webhookUrl?: string; refresh?: boolean }) => {
    setDone("");
    configure.mutate({ kind: i.kind, ...fields });
  };

  return (
    <section className={styles.card} data-tone={state.tone} aria-labelledby={`arr-${i.kind}`}>
      <div className={styles.cardHead}>
        <h2 id={`arr-${i.kind}`} className={styles.cardTitle}>
          {name} <span className={styles.muted}>· {what}</span>
        </h2>
        <span className={styles.pill} data-tone={state.tone}>
          {state.pill}
          {i.version ? ` · v${i.version}` : ""}
        </span>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.grid2Fields}>
          <Field
            label={t("adminArr.address")}
            placeholder={`http://localhost:${port}`}
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Field
            label={t("adminArr.apiKey")}
            type="password"
            autoComplete="off"
            required
            hint={i.url ? t("adminArr.apiKeyAgain") : t("adminArr.apiKeyWhere")}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        {state.checks.length > 0 && (
          <ul className={styles.checks}>
            {state.checks.map((c) => (
              <li key={c.label} className={styles.check} data-ok={c.ok}>
                <span className={styles.checkMark} aria-hidden="true">
                  {c.ok ? "✓" : "!"}
                </span>
                {c.label}
              </li>
            ))}
          </ul>
        )}
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Status className={styles.ok} message={done} />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy || !url.trim() || !apiKey.trim()}>
            {t("adminArr.trySave")}
          </Button>
          {i.reachable && (
            <>
              <button
                type="button"
                className={styles.small}
                disabled={busy}
                onClick={() => act({ kodiMetadata: true })}
              >
                {t("adminArr.kodi")}
              </button>
              <button
                type="button"
                className={styles.small}
                disabled={busy || !laternaUrl.trim()}
                onClick={() => act({ webhookUrl: laternaUrl.trim() })}
              >
                {i.webhook ? t("adminArr.reinstallWebhook") : t("adminArr.installWebhook")}
              </button>
              <button
                type="button"
                className={styles.small}
                disabled={busy}
                onClick={() => act({ refresh: true })}
              >
                {t("adminArr.refreshAll")}
              </button>
            </>
          )}
          <span className={styles.spacer} />
          {i.url && (
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() => {
                setDone("");
                forget.mutate({ kind: i.kind });
              }}
            >
              {t("adminArr.forget")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
