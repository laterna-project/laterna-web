import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { serverUrl } from "../../../api/transport";
import styles from "../../../features/admin/admin.module.css";
import { IntegrationCard } from "../../../features/admin/IntegrationCard";
import { AdminHead } from "../../../features/admin/ui";
import { IntegrationService } from "../../../gen/laterna/v1/integration_pb";
import { Alert } from "../../../ui/Alert";
import { Field } from "../../../ui/Field";

export const Route = createFileRoute("/_app/admin/sonarr-radarr")({
  component: Integrations,
});

/**
 * Sonarr and Radarr: they write the NFO files and images Laterna reads, and notify it of each
 * import with a webhook.
 */
function Integrations() {
  const { t } = useTranslation();
  const list = useQuery(IntegrationService.method.listIntegrations, {});
  // Laterna's address as seen from the instances (for the webhook): the app's by default.
  const [laternaUrl, setLaternaUrl] = useState(serverUrl);

  return (
    <>
      <AdminHead title={t("adminArr.title")} sub={t("adminArr.subtitle")} />
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      {list.isPending && <p className={styles.muted}>{t("adminOverview.querying")}</p>}
      <div className={styles.grid2}>
        {(list.data?.integrations ?? []).map((i) => (
          <IntegrationCard key={i.kind} integration={i} laternaUrl={laternaUrl} />
        ))}
      </div>
      {/* The webhook is only installed on an instance that answers. */}
      {list.data?.integrations.some((i) => i.reachable) && (
        <section className={styles.card} aria-label={t("adminArr.webhookAddressLabel")}>
          <Field
            label={t("adminArr.webhookAddress")}
            hint={t("adminArr.webhookHint")}
            value={laternaUrl}
            onChange={(e) => setLaternaUrl(e.target.value)}
          />
        </section>
      )}
    </>
  );
}
