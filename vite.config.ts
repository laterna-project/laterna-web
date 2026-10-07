import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { cssLayer } from "./devtools/vite/layer.ts";
import { pdfjsAssets } from "./devtools/vite/pdfjs-assets.ts";
import { serviceWorker } from "./devtools/vite/service-worker.ts";

// Laterna server used in development ("task dev" in a checkout of the server).
const server = process.env.LATERNA_URL ?? "http://localhost:8096";

// Server routes proxied by Vite, so the app and the API share the same origin in development:
// Connect services (/laterna.v1.<Service>/<Method>) and byte routes (images, streams, fonts,
// scrubbing thumbnails, books, downloads, logs, backups), the OpenID Connect callback and metrics.
// Production needs the same routes on the same origin (README).
// Prefixes end with a slash where the app has a route starting with the same letters (/bookshelf).
const proxied = [
  "/images/",
  "/playback/",
  "/fonts/",
  "/trickplay/",
  "/books/",
  "/downloads/",
  "/logs/",
  "/backups/",
  "/health",
  "/auth/oidc",
  "/metrics",
];

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    pdfjsAssets(),
    // The app's styles go in the "app" layer: the chosen theme goes on top.
    cssLayer("app"),
    serviceWorker(),
  ],
  build: {
    // The player bundles hls.js (about 400 kB); it only loads when a playback opens.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      "^/laterna\\.v1\\.": { target: server, changeOrigin: true },
      ...Object.fromEntries(proxied.map((p) => [p, { target: server, changeOrigin: true }])),
    },
  },
  test: {
    // Node by default (fast); a component test asks for jsdom at the top of its file (//
    // @vitest-environment jsdom).
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    setupFiles: ["src/i18n/test-setup.ts"],
  },
});
