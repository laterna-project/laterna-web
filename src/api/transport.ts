import { Code, ConnectError, type Interceptor, type Transport } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "../gen/laterna/v1/auth_pb";
import { locale } from "../i18n";
import { sessionToken, setSessionToken } from "./session";

/** Server address: the same origin (proxied by Vite in development), unless VITE_LATERNA_URL is set. */
export function serverUrl(): string {
  return import.meta.env.VITE_LATERNA_URL ?? window.location.origin;
}

/**
 * Calls whose "unauthenticated" refusal is about a credential in the request (a typed password),
 * not about the device token: the token stays.
 */
const credentialChecks: readonly unknown[] = [AuthService.method.login, AuthService.method.changePassword];

/** Adds the session token to each call, and forgets it if the server refuses it. */
export const authInterceptor: Interceptor = (next) => async (req) => {
  // The server writes its fallback texts in this language (server: docs/design/i18n.md).
  req.header.set("Accept-Language", locale());
  const token = sessionToken();
  if (token !== null) req.header.set("Authorization", `Bearer ${token}`);
  try {
    return await next(req);
  } catch (err) {
    if (
      token !== null &&
      ConnectError.from(err).code === Code.Unauthenticated &&
      !credentialChecks.includes(req.method)
    )
      setSessionToken(null);
    throw err;
  }
};

/**
 * The app's Connect transport. Reads (NO_SIDE_EFFECTS in the contract) use GET, so browsers and
 * proxies can cache them.
 */
export function createTransport(baseUrl: string = serverUrl()): Transport {
  return createConnectTransport({ baseUrl, useHttpGet: true, interceptors: [authInterceptor] });
}
