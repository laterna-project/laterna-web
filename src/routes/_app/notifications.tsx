import { useInfiniteQuery, useMutation } from "@connectrpc/connect-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { restricted } from "../../features/account/parental";
import { notificationLink } from "../../features/notifications/notifications";
import styles from "../../features/notifications/notifications.module.css";
import { NotificationRow, PushSwitch } from "../../features/notifications/ui";
import { NotificationService } from "../../gen/laterna/v1/notification_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Status } from "../../ui/Status";

export const Route = createFileRoute("/_app/notifications")({
  // "?open=<notification>": a notification of the system was clicked (src/app/sw.ts).
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === "string" && search.open ? { open: search.open } : {},
  component: NotificationsPage,
});

/**
 * Notifications of the profile (server: docs/design/notifications.md): its requests, the new
 * episodes of the series it follows. The same list on every device; this one chooses whether it is
 * also told while the app is closed.
 */
function NotificationsPage() {
  const { t } = useTranslation();
  const { profile, session } = Route.useRouteContext();
  const { open } = Route.useSearch();
  const invalidate = useInvalidate();
  const admin = Boolean(session.account?.isAdmin) && !restricted(profile);
  const [done, setDone] = useState("");
  const list = useInfiniteQuery(
    NotificationService.method.listNotifications,
    { pageSize: 30, pageToken: "" },
    { pageParamKey: "pageToken", getNextPageParam: (last) => last.nextPageToken || undefined },
  );
  const refresh = () => invalidate(NotificationService);
  const { mutate: markRead, ...read } = useMutation(NotificationService.method.markNotificationsRead, {
    onSuccess: refresh,
  });
  const remove = useMutation(NotificationService.method.deleteNotifications, { onSuccess: refresh });
  const notifications = list.data?.pages.flatMap((p) => p.notifications) ?? [];
  const unread = list.data?.pages[0]?.unreadCount ?? 0;
  const busy = read.isPending || remove.isPending;
  const error = list.error ?? read.error ?? remove.error;

  // The notification clicked in the system: read, and what it names opens in place of the list.
  const opened = open && list.isSuccess ? notifications.find((n) => n.id === open) : undefined;
  const handled = useRef("");
  useEffect(() => {
    if (!opened || handled.current === opened.id) return;
    handled.current = opened.id;
    if (!opened.read) markRead({ notificationIds: [opened.id] });
  }, [opened, markRead]);
  const target = opened ? notificationLink(opened, admin) : undefined;
  if (target) return <Navigate {...target} replace />;

  return (
    <div className={styles.page}>
      <div className={styles.head} data-ui="page-header">
        <div className={styles.headText}>
          <h1 className={styles.title}>{t("notifications.title")}</h1>
          <p className={styles.subtitle}>{t("notifications.subtitle", { name: profile.name })}</p>
        </div>
        {notifications.length > 0 && (
          <div className={styles.actions}>
            {unread > 0 && (
              <button
                type="button"
                className={styles.small}
                disabled={busy}
                onClick={() => {
                  setDone("");
                  markRead({ all: true }, { onSuccess: () => setDone(t("notifications.allRead")) });
                }}
              >
                {t("notifications.markAllRead")}
              </button>
            )}
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() => {
                setDone("");
                remove.mutate({ all: true }, { onSuccess: () => setDone(t("notifications.allDeleted")) });
              }}
            >
              {t("notifications.deleteAll")}
            </button>
          </div>
        )}
      </div>
      <PushSwitch />
      {error && <Alert>{errorMessage(error)}</Alert>}
      <Status className={styles.status} message={done} />
      {list.isSuccess && notifications.length === 0 && (
        <p className={styles.empty}>{t("notifications.empty")}</p>
      )}
      {notifications.length > 0 && (
        <ul className={styles.list} aria-label={t("notifications.title")}>
          {notifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              admin={admin}
              busy={busy}
              onOpen={() => {
                if (!n.read) markRead({ notificationIds: [n.id] });
              }}
              onDelete={() => {
                setDone("");
                remove.mutate(
                  { notificationIds: [n.id] },
                  { onSuccess: () => setDone(t("notifications.deleted")) },
                );
              }}
            />
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <div className={styles.actions}>
          <Button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {t("common.seeMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
