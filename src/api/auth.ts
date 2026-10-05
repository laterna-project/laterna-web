import type { QueryClient } from "@tanstack/react-query";
import { setSessionToken } from "./session";

/** Opens this device's session: new token, and nothing of the previous account left in the cache. */
export function startSession(queryClient: QueryClient, token: string): void {
  queryClient.clear();
  setSessionToken(token);
}

/** Closes the session locally (the server was already told, or no longer answers). */
export function endSession(queryClient: QueryClient): void {
  setSessionToken(null);
  queryClient.clear();
}
