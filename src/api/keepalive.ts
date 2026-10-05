import { sessionToken } from "./session";
import { serverUrl } from "./transport";

/**
 * Connect call (JSON body) that outlives the page: a keepalive request, for what must be sent when
 * the tab closes (end of playback, page reached in a book). The Connect transport cannot do it.
 */
export function postKeepalive(procedure: string, body: object): void {
  const token = sessionToken();
  try {
    void fetch(new URL(procedure, serverUrl()), {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // Lost: the server keeps the last position it received.
  }
}
