import { afterEach, describe, expect, it, vi } from "vitest";
import {
  keyBytes,
  openedNotification,
  pushFields,
  pushState,
  pushSupported,
  renewedPush,
  subscribePush,
} from "./push";

afterEach(() => vi.unstubAllGlobals());

const keys = { p256dh: "a2V5", auth: "c2VjcmV0" };

/** A browser subscription, as much of it as the app reads. */
const subscription = (endpoint: string, its: Record<string, string> = keys) => ({
  endpoint,
  toJSON: () => ({ endpoint, keys: its }),
  unsubscribe: vi.fn(async () => true),
});

/** Stands in for a browser with a service worker, the Push API and a notification permission. */
function browser(o: { permission: string; current?: ReturnType<typeof subscription>; registered?: boolean }) {
  const pushManager = {
    getSubscription: vi.fn(async () => o.current ?? null),
    subscribe: vi.fn(async () => subscription("https://push.example/new")),
  };
  const registration = { pushManager };
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: async () => (o.registered === false ? undefined : registration),
      ready: Promise.resolve(registration),
    },
  });
  const Notification = { permission: o.permission, requestPermission: vi.fn(async () => o.permission) };
  vi.stubGlobal("window", { PushManager: class {}, Notification });
  vi.stubGlobal("Notification", Notification);
  return pushManager;
}

describe("keyBytes", () => {
  it("reads the server's key from base64url, with or without padding", () => {
    expect([...keyBytes("BP_-")]).toEqual([4, 255, 254]);
    expect([...keyBytes("AQI")]).toEqual([1, 2]);
    expect([...keyBytes("AQI=")]).toEqual([1, 2]);
  });
});

describe("pushFields", () => {
  it("gives the endpoint and the two keys, without padding", () => {
    const sub = subscription("https://push.example/1", { p256dh: "a2V5cw==", auth: "c2VjcmV0" });
    expect(pushFields(sub)).toEqual({
      endpoint: "https://push.example/1",
      p256dh: "a2V5cw",
      auth: "c2VjcmV0",
    });
  });

  it("gives nothing for a subscription without keys", () => {
    expect(pushFields(subscription("https://push.example/1", {}))).toBeUndefined();
  });
});

describe("pushState", () => {
  it("is unsupported without the Push API or without a service worker", async () => {
    expect(pushSupported()).toBe(false);
    expect(await pushState("https://push.example/1")).toBe("unsupported");
    browser({ permission: "granted", registered: false });
    expect(await pushState("https://push.example/1")).toBe("unsupported");
  });

  it("says when the user blocked notifications", async () => {
    browser({ permission: "denied" });
    expect(await pushState("")).toBe("denied");
  });

  it("is on when the browser's subscription is the one the server knows", async () => {
    browser({ permission: "granted", current: subscription("https://push.example/1") });
    expect(await pushState("https://push.example/1")).toBe("on");
    expect(await pushState("https://push.example/other")).toBe("off");
    expect(await pushState("")).toBe("off");
    browser({ permission: "default", current: subscription("https://push.example/1") });
    expect(await pushState("https://push.example/1")).toBe("off");
  });
});

describe("subscribePush", () => {
  it("asks the user, then subscribes with the server's key", async () => {
    const pushManager = browser({ permission: "granted" });
    expect(await subscribePush("AQI")).toEqual({
      endpoint: "https://push.example/new",
      p256dh: "a2V5",
      auth: "c2VjcmV0",
    });
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2]),
    });
  });

  it("stops when the user says no", async () => {
    const pushManager = browser({ permission: "denied" });
    await expect(subscribePush("AQI")).rejects.toThrow();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("replaces a subscription made for another key", async () => {
    const old = subscription("https://push.example/old");
    const pushManager = browser({ permission: "granted", current: old });
    pushManager.subscribe.mockRejectedValueOnce(new Error("another key"));
    expect((await subscribePush("AQI")).endpoint).toBe("https://push.example/new");
    expect(old.unsubscribe).toHaveBeenCalled();
  });
});

describe("renewedPush", () => {
  it("has nothing to do for a device that is not subscribed, or whose subscription is known", async () => {
    browser({ permission: "granted", current: subscription("https://push.example/1") });
    expect(await renewedPush("", "AQI")).toBeUndefined();
    expect(await renewedPush("https://push.example/1", "AQI")).toBeUndefined();
  });

  it("hands over the subscription the browser renewed", async () => {
    browser({ permission: "granted", current: subscription("https://push.example/2") });
    expect((await renewedPush("https://push.example/1", "AQI"))?.endpoint).toBe("https://push.example/2");
  });

  it("subscribes again when the browser lost its subscription and may still notify", async () => {
    const pushManager = browser({ permission: "granted" });
    expect((await renewedPush("https://push.example/1", "AQI"))?.endpoint).toBe("https://push.example/new");
    expect(pushManager.subscribe).toHaveBeenCalled();
  });

  it("never asks the user anything", async () => {
    const pushManager = browser({ permission: "default" });
    expect(await renewedPush("https://push.example/1", "AQI")).toBeUndefined();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe("openedNotification", () => {
  it("reads the message of the service worker, and no other", () => {
    expect(openedNotification({ type: "laterna.notification", id: "n1" })).toEqual({ id: "n1" });
    expect(openedNotification({ type: "laterna.notification" })).toEqual({ id: "" });
    expect(openedNotification({ type: "something else", id: "n1" })).toBeUndefined();
    expect(openedNotification("laterna.notification")).toBeUndefined();
    expect(openedNotification(null)).toBeUndefined();
  });
});
