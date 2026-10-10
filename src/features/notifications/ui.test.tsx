// @vitest-environment jsdom
import { Code, ConnectError, createRouterTransport, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationService, type SubscribePushRequest } from "../../gen/laterna/v1/notification_pb";
import { PushSwitch } from "./ui";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Providers({ transport, children }: { transport: Transport; children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </TransportProvider>
  );
}

/** A browser that can be notified: a service worker, the Push API, and a user who says yes. */
function browser() {
  let current: { endpoint: string; toJSON(): object; unsubscribe(): Promise<boolean> } | null = null;
  const pushManager = {
    getSubscription: async () => current,
    subscribe: async () => {
      current = {
        endpoint: "https://push.example/device",
        toJSON: () => ({ keys: { p256dh: "a2V5", auth: "c2VjcmV0" } }),
        unsubscribe: async () => {
          current = null;
          return true;
        },
      };
      return current;
    },
  };
  const registration = { pushManager };
  vi.stubGlobal("navigator", {
    serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) },
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: async () => "granted" });
  return { subscribed: () => current !== null };
}

/** A server that keeps the subscription of the device. */
function server() {
  const state = { endpoint: "", received: undefined as SubscribePushRequest | undefined };
  const transport = createRouterTransport(({ service }) => {
    service(NotificationService, {
      getPushConfig: () => ({ publicKey: "AQI", endpoint: state.endpoint }),
      subscribePush(req) {
        state.received = req;
        state.endpoint = req.endpoint;
        return {};
      },
      unsubscribePush() {
        state.endpoint = "";
        return {};
      },
    });
  });
  return { state, transport };
}

describe("push switch", () => {
  it("subscribes this device, then ends its subscription", async () => {
    const device = browser();
    const { state, transport } = server();
    render(
      <Providers transport={transport}>
        <PushSwitch />
      </Providers>,
    );
    const toggle = await screen.findByRole("switch", { name: "Notify this device" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(state.received).toMatchObject({
      endpoint: "https://push.example/device",
      p256dh: "a2V5",
      auth: "c2VjcmV0",
    });
    expect(screen.getByText("This device will be notified.")).toBeTruthy();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(state.endpoint).toBe("");
    expect(device.subscribed()).toBe(false);
  });

  it("says when this browser cannot be notified", async () => {
    // No service worker: jsdom has none, like a page that is not served over https.
    const { transport } = server();
    render(
      <Providers transport={transport}>
        <PushSwitch />
      </Providers>,
    );
    const toggle = await screen.findByRole("switch", { name: "Notify this device" });
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/This browser cannot be notified here/)).toBeTruthy();
  });

  it("says when the user blocked notifications", async () => {
    browser();
    vi.stubGlobal("Notification", { permission: "denied", requestPermission: async () => "denied" });
    const { transport } = server();
    render(
      <Providers transport={transport}>
        <PushSwitch />
      </Providers>,
    );
    const toggle = await screen.findByRole("switch", { name: "Notify this device" });
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Notifications are blocked for this site/)).toBeTruthy();
  });

  it("shows nothing with a server that has no push", async () => {
    browser();
    let asked = false;
    const transport = createRouterTransport(({ service }) => {
      service(NotificationService, {
        getPushConfig() {
          asked = true;
          throw new ConnectError("unknown method", Code.Unimplemented);
        },
      });
    });
    const { container } = render(
      <Providers transport={transport}>
        <PushSwitch />
      </Providers>,
    );
    await waitFor(() => expect(asked).toBe(true));
    expect(container.textContent).toBe("");
  });
});
