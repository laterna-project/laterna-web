# Architecture

Laterna exposes a ConnectRPC API defined by a Protobuf contract, with server streams (events,
watch parties) and plain HTTP routes for bytes (images, HLS streams, books, downloads). The web
client must cover what the server does, nothing more, and follow the contract without drifting.

## Stack

- **Vite, React and strict TypeScript.** CSS Modules and design tokens for styles
  ([themes](themes.md)). Fonts are served with the app: a self-hosted server should not make its
  users' browsers call a font CDN.
- **Generated client.** buf and `protoc-gen-es` generate TypeScript from the server's `proto/`
  into `src/gen`, which is committed. The input is the server repository at the version pinned in
  `package.json` (`laternaServer`), so a build never depends on what happens to be checked out
  next to it. `pnpm gen:check` fails if the code or the server's text catalogs differ from that
  version, and a contract change that breaks the client shows up at compile time.
- **Transport.** `@connectrpc/connect-web` with the Connect protocol: readable JSON in the
  browser's tools, server streams over `fetch`. Methods marked `NO_SIDE_EFFECTS` in the contract
  use GET, so browsers and proxies can cache them. The session token is sent as a `Bearer` header
  and kept in local storage; the interceptor forgets it when the server refuses it, except when
  the refusal is about a password typed in the request (`Login`, `ChangePassword`).
- **Data.** connect-query on top of TanStack Query: caching, token-based paging, invalidation.
  Shared query options (`src/api/queries.ts`) serve both route loaders and components.
- **Routes.** TanStack Router with file-based, typed routes; data is loaded before a page renders.
  The root route reads the server's public state on each navigation and leads to the setup while
  it is pending. `_app` is the signed-in part: it requires a token and a chosen profile.
- **Quality.** Biome (format and lint in one tool), Vitest (Node by default, jsdom when a test
  asks for it), pnpm.

## The event stream

`EventService.Subscribe` is opened by the signed-in shell (`useServerEvents`) and reopened on each
profile change, since watch data belongs to the profile chosen when the stream opens. Each event
names what it makes stale; invalidations are batched over 400 ms and applied once, so a scan that
publishes every two seconds per library does not refetch the screen on every message. After a
disconnection, events may have been lost, so everything is refetched. Window focus does not
refetch: the stream already says what changed.

Pages that show something the server does not announce (current playback, jobs, server state)
poll while they are open.

## Leaving a page

What must reach the server when a tab closes (end of a playback, position in a book) is sent
with a `keepalive` request (`src/api/keepalive.ts`), which the Connect transport cannot do.

## Files protected by the token

Downloads, their subtitles, logs and backups need the `Authorization` header, which a link cannot
carry. `saveFile` streams them to a file the user picks where the browser allows it
(`showSaveFilePicker`), and otherwise keeps them in memory before offering them.

## Deployment

The build is a set of static files. It expects the API on the same origin, which keeps cookies,
CORS and passkey origins out of the picture: in development Vite proxies the server's routes, in
production a reverse proxy does (see the README). `VITE_LATERNA_URL` builds a client for a server
on another origin.

Large libraries load on demand: hls.js with the player, JASSUB with a styled subtitle, foliate-js
with an EPUB, pdf.js with a PDF, each interface language with its catalog.
