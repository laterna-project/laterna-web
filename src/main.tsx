import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/literata";
import "@fontsource-variable/atkinson-hyperlegible-next";
// "Magic lantern" theme: its fonts are only downloaded when the theme uses them.
import "@fontsource-variable/instrument-sans";
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
// Fonts of the server themes (server: docs/design/themes.md) not already loaded above: only
// downloaded when the profile's theme uses them.
import "@fontsource-variable/inter";
import "@fontsource-variable/lexend";
import "./theme/global.css";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient, router, transport } from "./app/router";
import { ready } from "./i18n";
import { applyTheme, savedTheme, watchTheme } from "./theme/theme";

applyTheme(savedTheme());
watchTheme();

// Accessibility audit in the console, in development only.
if (import.meta.env.DEV) void import("./app/audit").then((m) => m.installAudit());

// Installed app (docs/design/devices.md): the service worker exists in the build only, and browsers
// only offer it over HTTPS (or on this computer).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Once the server is updated, the files of the previous version are gone: a page still open
// reloads into the new version when it misses one, at most once a minute so that a file that is
// really missing does not reload forever.
window.addEventListener("vite:preloadError", (e) => {
  const key = "laterna.reloadedAt";
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  e.preventDefault();
  window.location.reload();
});

const root = document.getElementById("app");
if (root === null) throw new Error("element #app not found");

// The catalog of the device's language loads before the first render: no flash of English.
await ready;

createRoot(root).render(
  <StrictMode>
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TransportProvider>
  </StrictMode>,
);
