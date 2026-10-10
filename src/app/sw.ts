// Service worker of the installed app (docs/design/devices.md). It keeps the app's own files on the
// device, so that the app starts even when the server cannot be reached and shows its own "server
// unreachable" page. The server's data never goes through it: API calls and byte routes (images,
// streams, books, downloads) always go to the network. It also shows the notifications the server
// pushes to this device while the app is closed (server: docs/design/notifications.md).
//
// Built apart from the app (devtools/vite/service-worker.ts) into /sw.js, which starts with the
// build's description below. It runs in the worker, not in a page: the few worker types it uses are
// declared here rather than mixing the WebWorker library into the app's types.

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface PushEvent extends ExtendableEvent {
  readonly data: { text(): string } | null;
}

interface NotificationEvent extends ExtendableEvent {
  readonly notification: { readonly data: unknown; close(): void };
}

interface WindowClient {
  readonly url: string;
  focus(): Promise<WindowClient>;
  postMessage(message: unknown): void;
}

declare const self: {
  readonly location: Location;
  readonly clients: {
    claim(): Promise<void>;
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<WindowClient[]>;
    openWindow(url: string): Promise<WindowClient | null>;
  };
  readonly registration: {
    showNotification(
      title: string,
      options: { body: string; icon: string; badge: string; tag?: string; data: unknown },
    ): Promise<void>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (e: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (e: FetchEvent) => void): void;
  addEventListener(type: "push", listener: (e: PushEvent) => void): void;
  addEventListener(type: "notificationclick", listener: (e: NotificationEvent) => void): void;
};

/** This build: its identifier and the files of the first screen (the page, its scripts and styles). */
declare const build: { version: string; shell: string[] };

const prefix = "laterna-";
const cacheName = `${prefix}${build.version}`;

// A new version takes over at once: the page is always fetched from the network first, so a page
// of the previous version still open only misses files it has not loaded yet, and then reloads
// (src/main.tsx).
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(build.shell))
      .then(() => self.skipWaiting()),
  );
});

// The files of previous versions go.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n.startsWith(prefix) && n !== cacheName).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Pages: from the server, which serves the app at every address; without it, the app kept here.
  if (request.mode === "navigate") {
    e.respondWith(fetch(request).catch(() => offlinePage()));
    return;
  }
  // The app's built files are named after their content: kept as soon as they are loaded once.
  if (url.pathname.startsWith("/assets/")) e.respondWith(kept(request, e));
});

// A notification pushed by the server: a small JSON object, its text already written in the
// language of the profile (id, kind, title, body, and the item or the request it is about). The
// title is the server's name.
self.addEventListener("push", (e) => {
  let message: { id?: unknown; title?: unknown; body?: unknown } = {};
  try {
    message = JSON.parse(e.data?.text() ?? "{}") ?? {};
  } catch {
    // Not ours: shown without a text, since a push must always show something.
  }
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const id = text(message.id);
  e.waitUntil(
    self.registration.showNotification(text(message.title) || "Laterna", {
      body: text(message.body),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // The same notification pushed twice replaces itself.
      tag: id || undefined,
      data: { id },
    }),
  );
});

// A click opens the app on that notification: the list knows what it names (a movie, an episode,
// a request) and opens it. An open window is told and brought to the front; without one, the app
// opens.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const data = e.notification.data as { id?: unknown } | null;
  e.waitUntil(openNotification(typeof data?.id === "string" ? data.id : ""));
});

async function openNotification(id: string): Promise<void> {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const app = windows.find((w) => new URL(w.url).origin === self.location.origin);
  if (app) {
    app.postMessage({ type: "laterna.notification", id });
    await app.focus().catch(() => {});
    return;
  }
  await self.clients.openWindow(id ? `/notifications?open=${encodeURIComponent(id)}` : "/notifications");
}

async function offlinePage(): Promise<Response> {
  return (await caches.match("/", { cacheName })) ?? Response.error();
}

async function kept(request: Request, e: ExtendableEvent): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) e.waitUntil(cache.put(request, response.clone()));
  return response;
}

export {};
