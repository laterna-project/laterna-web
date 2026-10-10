import { useMutation, useQuery } from "@connectrpc/connect-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { mediaUrl } from "../../api/media";
import { type Notification, NotificationService } from "../../gen/laterna/v1/notification_pb";
import { Alert } from "../../ui/Alert";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import { Status } from "../../ui/Status";
import { Switch } from "../../ui/Switch";
import { relativeTime } from "../catalog/format";
import {
  badgeCount,
  type NotificationArt,
  notificationArt,
  notificationDate,
  notificationLink,
  notificationText,
} from "./notifications";
import styles from "./notifications.module.css";
import {
  openedNotification,
  PushDenied,
  type PushState,
  pushState,
  renewedPush,
  subscribePush,
  unsubscribePush,
} from "./push";

/**
 * Bell of the header: opens the notifications of the profile, and counts those it has not read.
 * A server that has no notifications (before 0.10) shows no bell.
 */
export function NotificationsBell() {
  const { t } = useTranslation();
  // Only the count is read here: the page reads the list.
  const list = useQuery(NotificationService.method.listNotifications, { pageSize: 1 });
  if (!list.data) return null;
  const unread = list.data.unreadCount;
  return (
    <Link
      to="/notifications"
      className={styles.bell}
      data-ui="notifications-button"
      aria-label={unread > 0 ? t("notifications.unread", { count: unread }) : t("nav.notifications")}
      activeProps={{ "aria-current": "page" }}
    >
      <Icon name="bell" />
      {unread > 0 && (
        <span className={styles.count} data-ui="badge" aria-hidden="true">
          {badgeCount(unread)}
        </span>
      )}
    </Link>
  );
}

/**
 * A notification of the list: its picture, what it says, when. It opens what it names, which marks
 * it read; the button deletes it.
 */
export function NotificationRow({
  notification: n,
  admin,
  busy,
  onOpen,
  onDelete,
}: {
  notification: Notification;
  /** The profile administers: a request that waits opens in the administration. */
  admin: boolean;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const text = notificationText(n);
  const link = notificationLink(n, admin);
  const date = notificationDate(n);
  const body = (
    <>
      <Picture art={notificationArt(n)} />
      <span className={styles.text}>
        <span className={styles.message}>{text}</span>
        <span className={styles.meta}>
          {!n.read && (
            <>
              <span className={styles.dot} aria-hidden="true" />
              <span className="sr-only">{t("notifications.unreadMark")}</span>
            </>
          )}
          {date && <time dateTime={date.toISOString()}>{relativeTime(date)}</time>}
        </span>
      </span>
    </>
  );
  return (
    <li className={styles.row} data-ui="notification" data-unread={!n.read || undefined}>
      {link ? (
        <Link {...link} className={styles.open} onClick={onOpen}>
          {body}
        </Link>
      ) : (
        <div className={styles.open}>{body}</div>
      )}
      <button
        type="button"
        className={styles.remove}
        disabled={busy}
        aria-label={t("notifications.deleteLabel", { text })}
        onClick={onDelete}
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}

/** The image of the item, else the poster of the request, else a bell. */
function Picture({ art }: { art: NotificationArt }) {
  const [failed, setFailed] = useState(false);
  if (art.image && art.universe)
    return (
      <Artwork
        image={art.image}
        sizes="56px"
        ratio={1}
        universe={art.universe}
        shape={art.shape}
        className={styles.art}
      />
    );
  return (
    <span className={styles.art}>
      {art.posterUrl && !failed ? (
        <img
          src={mediaUrl(art.posterUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name="bell" size={22} />
      )}
    </span>
  );
}

/** What the switch says under its label, by state. */
const hints = {
  unsupported: "push.unsupported",
  denied: "push.denied",
  off: "push.hint",
  on: "push.hint",
} as const;

/**
 * "Notify this device": subscribes this browser to web push, or ends its subscription. Each device
 * decides for itself; the list of notifications is the same everywhere. Shows nothing with a
 * server that has no push.
 */
export function PushSwitch() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const config = useQuery(NotificationService.method.getPushConfig, {});
  const [state, setState] = useState<PushState>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const subscribe = useMutation(NotificationService.method.subscribePush);
  const unsubscribe = useMutation(NotificationService.method.unsubscribePush);
  const endpoint = config.data?.endpoint;
  useEffect(() => {
    if (endpoint === undefined) return;
    let current = true;
    void pushState(endpoint).then((s) => {
      if (current) setState(s);
    });
    return () => {
      current = false;
    };
  }, [endpoint]);
  const publicKey = config.data?.publicKey;
  if (!publicKey || state === undefined) return null;

  const change = async (on: boolean) => {
    setWorking(true);
    setError("");
    setDone("");
    try {
      if (on) await subscribe.mutateAsync(await subscribePush(publicKey));
      else {
        // The server first: if it cannot be told, nothing changes on either side.
        await unsubscribe.mutateAsync({});
        await unsubscribePush();
      }
      setDone(t(on ? "push.on" : "push.off"));
    } catch (err) {
      if (err instanceof PushDenied) setState("denied");
      else setError(err instanceof DOMException ? t("push.failed") : errorMessage(err));
    } finally {
      await invalidate(NotificationService);
      setWorking(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="push">
      <h2 id="push" className={styles.cardTitle}>
        {t("push.title")}
      </h2>
      <Switch
        label={t("push.label")}
        hint={t(hints[state])}
        on={state === "on"}
        disabled={working || state === "unsupported" || state === "denied"}
        onChange={(on) => void change(on)}
      />
      {error && <Alert>{error}</Alert>}
      <Status className={styles.status} message={done} />
    </section>
  );
}

/**
 * Keeps the server's copy of this device's push subscription right: browsers renew theirs on their
 * own, and the server would go on writing to an address that no longer answers.
 */
export function usePushSync(): void {
  const invalidate = useInvalidate();
  const config = useQuery(NotificationService.method.getPushConfig, {});
  const { mutate } = useMutation(NotificationService.method.subscribePush, {
    onSuccess: () => invalidate(NotificationService),
  });
  const endpoint = config.data?.endpoint ?? "";
  const publicKey = config.data?.publicKey ?? "";
  useEffect(() => {
    let current = true;
    void renewedPush(endpoint, publicKey)
      .then((fields) => {
        if (fields && current) mutate(fields);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [endpoint, publicKey, mutate]);
}

/**
 * A notification of the system was clicked while the app is open: the service worker says which
 * (src/app/sw.ts), and the list opens on it.
 */
export function usePushClicks(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const opened = openedNotification(e.data);
      if (opened) void navigate({ to: "/notifications", search: opened.id ? { open: opened.id } : {} });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);
}
