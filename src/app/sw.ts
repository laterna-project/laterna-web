// Service worker of the installed app (docs/design/devices.md). It keeps the app's own files on the
// device, so that the app starts even when the server cannot be reached and shows its own "server
// unreachable" page. The server's data never goes through it: API calls and byte routes (images,
// streams, books, downloads) always go to the network.
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

declare const self: {
  readonly location: Location;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (e: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (e: FetchEvent) => void): void;
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
