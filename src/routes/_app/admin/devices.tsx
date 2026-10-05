import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead } from "../../../features/admin/ui";
import { relativeTime } from "../../../features/catalog/format";
import { AccountService } from "../../../gen/laterna/v1/account_pb";
import { ActivityService, type DeviceSession } from "../../../gen/laterna/v1/activity_pb";
import { AuthService } from "../../../gen/laterna/v1/auth_pb";
import { locale } from "../../../i18n";
import { Alert } from "../../../ui/Alert";

export const Route = createFileRoute("/_app/admin/devices")({
  component: Devices,
});

const used = (d: DeviceSession) => Number(d.lastUsedAt?.seconds ?? 0n);

/** Signed-in devices of every account, grouped by account; each can be signed out. */
function Devices() {
  const { t } = useTranslation();
  const list = useQuery(ActivityService.method.listDevices, {});
  const invalidate = useInvalidate();
  const revoke = useMutation(ActivityService.method.revokeDevice, {
    onSuccess: () => invalidate(ActivityService, AccountService, AuthService),
  });
  const devices = [...(list.data?.devices ?? [])].sort((a, b) => used(b) - used(a));
  const groups = [...new Set(devices.map((d) => d.username))].map((username) => ({
    username,
    devices: devices.filter((d) => d.username === username),
  }));

  return (
    <>
      <AdminHead
        title={t("adminDevices.title")}
        sub={t("adminDevices.subtitle", { count: devices.length })}
      />
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      {revoke.isError && <Alert>{errorMessage(revoke.error)}</Alert>}
      {groups.map((g) => (
        <section
          key={g.username}
          className={styles.card}
          aria-label={t("adminDevices.ofUser", { name: g.username })}
        >
          <h2 className={styles.cardTitle}>
            {g.username} <span className={styles.muted}>· {g.devices.length}</span>
          </h2>
          <ul className={styles.rows}>
            {g.devices.map((d) => {
              const last = d.lastUsedAt ? new Date(Number(d.lastUsedAt.seconds) * 1000) : undefined;
              const since = d.createdAt ? new Date(Number(d.createdAt.seconds) * 1000) : undefined;
              return (
                <li key={d.sessionId} className={styles.deviceRow}>
                  <span className={styles.initial} aria-hidden="true">
                    {(d.device?.platform || d.device?.client || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className={styles.libText}>
                    <span className={styles.libName}>{d.device?.name || t("common.unnamedDevice")}</span>
                    <span className={styles.muted}>
                      {[
                        [d.device?.client, d.device?.clientVersion].filter(Boolean).join(" "),
                        d.device?.platform,
                        d.profileName
                          ? t("adminDevices.profile", { name: d.profileName })
                          : t("adminDevices.noProfile"),
                        d.lastIp,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span
                    className={styles.muted}
                    title={
                      since
                        ? t("adminDevices.connectedOn", { date: since.toLocaleString(locale()) })
                        : undefined
                    }
                  >
                    {last ? t("adminDevices.seen", { when: relativeTime(last) }) : ""}
                  </span>
                  {d.current ? (
                    <span className={styles.pill} data-tone="ok">
                      {t("adminDevices.thisDevice")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.small}
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate({ sessionId: d.sessionId })}
                      aria-label={t("adminDevices.signOutLabel", {
                        device: d.device?.name || t("adminDevices.thatDevice"),
                        user: d.username,
                      })}
                    >
                      {t("adminDevices.signOut")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
