// This device's session token. The server only keeps a hash of it: once lost, the user signs in
// again. Kept in local storage, not in a cookie: the API expects a Bearer header.

const storageKey = "laterna.token";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

let current = read();

/** Current token, null if the device is not signed in. */
export function sessionToken(): string | null {
  return current;
}

/** Stores the token received at login, or forgets it (null). */
export function setSessionToken(token: string | null): void {
  current = token;
  try {
    if (token === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, token);
  } catch {
    // Storage unavailable: the token lasts for this visit.
  }
  for (const listener of listeners) listener();
}

/** Notifies token changes (for useSyncExternalStore). */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
