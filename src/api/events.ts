import type { DescService } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { createConnectQueryKey, useTransport } from "@connectrpc/connect-query";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { BookService } from "../gen/laterna/v1/book_pb";
import { CatalogService } from "../gen/laterna/v1/catalog_pb";
import { CollectionService } from "../gen/laterna/v1/collection_pb";
import { DownloadService } from "../gen/laterna/v1/download_pb";
import { EventService, type LibraryScanned } from "../gen/laterna/v1/events_pb";
import { HomeService } from "../gen/laterna/v1/home_pb";
import { LibraryService } from "../gen/laterna/v1/library_pb";
import { MusicService } from "../gen/laterna/v1/music_pb";
import { PhotoService } from "../gen/laterna/v1/photo_pb";
import { PlaylistService } from "../gen/laterna/v1/playlist_pb";
import { ThemeService } from "../gen/laterna/v1/theme_pb";

/** Services whose responses depend on the catalog and on watch data. */
const catalogServices: DescService[] = [
  HomeService,
  CatalogService,
  MusicService,
  BookService,
  PhotoService,
  CollectionService,
  PlaylistService,
];

/** Screens that want the report of a scan (library administration). */
const scanListeners = new Set<(scan: LibraryScanned) => void>();

/** Calls listener at the end of each scan announced by the stream; returns the unsubscribe function. */
export function onLibraryScanned(listener: (scan: LibraryScanned) => void): () => void {
  scanListeners.add(listener);
  return () => scanListeners.delete(listener);
}

/** What an event makes stale: whole services, or everything. */
export type Stale = "all" | DescService;

/**
 * Batches invalidations that arrive in bursts (the server publishes at most every two seconds per
 * library) and applies them once.
 */
export function createInvalidator(queryClient: QueryClient, delay = 400) {
  const pending = new Set<Stale>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (pending.has("all")) void queryClient.invalidateQueries();
    else
      for (const s of pending) {
        if (s !== "all")
          void queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: s, cardinality: undefined }),
          });
      }
    pending.clear();
  };
  return {
    mark(...stale: Stale[]) {
      for (const s of stale) pending.add(s);
      timer ??= setTimeout(flush, delay);
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Listens to the server's event stream while the signed-in app is shown, and refetches what
 * changed. Reopened on each profile change (watch data belongs to the profile chosen when the
 * stream opened) and after a disconnection, refetching everything then.
 */
export function useServerEvents(profileId: string): void {
  const transport = useTransport();
  const queryClient = useQueryClient();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the stream is reopened on each profile change.
  useEffect(() => {
    const abort = new AbortController();
    const events = createClient(EventService, transport);
    const invalidator = createInvalidator(queryClient);
    void (async () => {
      let retry = 1000;
      let first = true;
      while (!abort.signal.aborted) {
        try {
          // Events may have been lost during the disconnection: refetch everything.
          if (!first) invalidator.mark("all");
          first = false;
          for await (const res of events.subscribe({}, { signal: abort.signal })) {
            retry = 1000;
            const kind = res.event?.kind;
            switch (kind?.case) {
              case "resync":
                invalidator.mark("all");
                break;
              case "librariesChanged":
                invalidator.mark(LibraryService, ...catalogServices);
                break;
              case "libraryScanned":
                invalidator.mark(LibraryService);
                for (const listener of scanListeners) listener(kind.value);
                break;
              case "itemsChanged":
              case "userDataChanged":
                invalidator.mark(...catalogServices);
                break;
              case "downloadsChanged":
                invalidator.mark(DownloadService);
                break;
              case "themesChanged":
                invalidator.mark(ThemeService);
                break;
              default:
                break;
            }
          }
        } catch {
          // Disconnected or server restarted: retried below.
        }
        if (abort.signal.aborted) break;
        await new Promise((r) => setTimeout(r, retry));
        retry = Math.min(retry * 2, 30_000);
      }
    })();
    return () => {
      abort.abort();
      invalidator.cancel();
    };
  }, [transport, queryClient, profileId]);
}
