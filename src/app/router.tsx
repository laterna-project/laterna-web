import type { Transport } from "@connectrpc/connect";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createTransport } from "../api/transport";
import { routeTree } from "../routeTree.gen";

/** What each route receives to load its data before rendering. */
export interface RouterContext {
  queryClient: QueryClient;
  transport: Transport;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The server's event stream (EventService) invalidates what changes: no need to refetch each
      // time the tab regains focus.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export const transport = createTransport();

export const router = createRouter({
  routeTree,
  context: { queryClient, transport },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
