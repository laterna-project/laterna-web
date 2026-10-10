// Web push (server: docs/design/notifications.md): a device can be told while the app is closed.
// The browser subscribes at its own push service with the server's key and hands the subscription
// to the server; the service worker (src/app/sw.ts) shows what arrives. A subscription belongs to
// this device's session: the server forgets it when the device signs out.

/** What the server takes of a subscription: its address and its two keys, in base64url. */
export interface PushFields {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Where this device stands: it cannot be told at all here, the user blocked notifications for the
 * site, or it is subscribed or not.
 */
export type PushState = "unsupported" | "denied" | "off" | "on";

/** The browser has a service worker, the Push API and notifications: https, or this computer. */
export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The server's key (base64url) as PushManager.subscribe takes it. */
export function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const b64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** A browser subscription as the server takes it; undefined if the browser gave no keys. */
export function pushFields(sub: Pick<PushSubscription, "endpoint" | "toJSON">): PushFields | undefined {
  const keys = sub.toJSON().keys ?? {};
  const unpadded = (s: string) => s.replace(/=+$/, "");
  if (!sub.endpoint || !keys.p256dh || !keys.auth) return undefined;
  return { endpoint: sub.endpoint, p256dh: unpadded(keys.p256dh), auth: unpadded(keys.auth) };
}

/**
 * The service worker of the app, once it runs; undefined where there is none (in development, or
 * when the browser refused it).
 */
async function worker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!pushSupported()) return undefined;
  if (!(await navigator.serviceWorker.getRegistration())) return undefined;
  return navigator.serviceWorker.ready;
}

/**
 * State of this device, given the endpoint the server has for it (GetPushConfig): it is "on" when
 * the browser's subscription is the one the server knows.
 */
export async function pushState(serverEndpoint: string): Promise<PushState> {
  const reg = await worker().catch(() => undefined);
  if (!reg) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (!serverEndpoint || Notification.permission !== "granted") return "off";
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  return sub?.endpoint === serverEndpoint ? "on" : "off";
}

/** The user said no to the browser's question. */
export class PushDenied extends Error {}

async function subscription(reg: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const options = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) };
  try {
    return await reg.pushManager.subscribe(options);
  } catch (err) {
    // A subscription made for another key (another server lived at this address) cannot be taken
    // over: it goes, and the browser subscribes again.
    const old = await reg.pushManager.getSubscription();
    if (!old) throw err;
    await old.unsubscribe();
    return reg.pushManager.subscribe(options);
  }
}

/**
 * Asks the user, then subscribes this browser with the server's key. Throws PushDenied if the user
 * says no.
 */
export async function subscribePush(publicKey: string): Promise<PushFields> {
  const reg = await worker();
  if (!reg) throw new Error("no service worker");
  if ((await Notification.requestPermission()) !== "granted") throw new PushDenied();
  const fields = pushFields(await subscription(reg, publicKey));
  if (!fields) throw new Error("subscription without keys");
  return fields;
}

/** Ends the browser's subscription, if it has one. */
export async function unsubscribePush(): Promise<void> {
  const reg = await worker();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
}

/**
 * Browsers renew a subscription on their own. When the server holds one for this device and the
 * browser's is another, or is gone while notifications are still allowed, returns the one to hand
 * to the server; undefined when there is nothing to do.
 */
export async function renewedPush(
  serverEndpoint: string,
  publicKey: string,
): Promise<PushFields | undefined> {
  if (!serverEndpoint || !publicKey) return undefined;
  const reg = await worker().catch(() => undefined);
  if (!reg || Notification.permission !== "granted") return undefined;
  const sub = await reg.pushManager.getSubscription();
  if (sub?.endpoint === serverEndpoint) return undefined;
  return pushFields(sub ?? (await subscription(reg, publicKey)));
}

/** Message of the service worker when a notification of the system is clicked (src/app/sw.ts). */
export const openMessage = "laterna.notification";

/** The notification a message of the service worker asks to open; undefined for any other message. */
export function openedNotification(data: unknown): { id: string } | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { type, id } = data as { type?: unknown; id?: unknown };
  if (type !== openMessage) return undefined;
  return { id: typeof id === "string" ? id : "" };
}
