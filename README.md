# Laterna Web

The web client of [Laterna](https://github.com/laterna-project/laterna), a self-hosted media
server for movies, series, music, books and photos.

The client talks to the server through its API only: a Protobuf contract served with
[ConnectRPC](https://connectrpc.com/). The TypeScript client is generated from that contract, so
the web app does what the server does, no more.

> The project is young. Until version 1.0, a minor version may change what the client needs from
> the server; the release notes say which server versions work.

## Server versions

| Laterna Web | Laterna server |
|---|---|
| 0.1.x | 0.1.x |

The contract and the server's text catalogs are taken from the server version pinned in
[`package.json`](package.json) (`laternaServer`).

## What it does

- **Home** as the server arranges it: resume, next up, recently added per library,
  recommendations, recently played music, continue reading. A **Discover** page with the full
  recommendation rows.
- **Movies and series**: lists with sorts and filters, detail pages with cast, files, versions,
  audio and subtitle tracks, similar titles, watched and favorite marks.
- **Video player**: direct play or HLS, resume, audio and subtitle tracks (WebVTT in the browser,
  styled ASS with their fonts through [JASSUB](https://github.com/ThaUnknown/jassub), burned in
  by the server otherwise), versions, chapters, scrubbing thumbnails, skip intro and recap, next
  episode at the end credits, keyboard shortcuts.
- **Music**: albums, artists and tracks, a player that keeps playing across pages, queue, shuffle
  and repeat, ReplayGain, media keys.
- **Books**: an EPUB reader ([foliate-js](https://github.com/johnfactotum/foliate-js)) with fonts,
  sizes, two columns and a table of contents; a page reader for comics, manga (right to left) and
  PDF ([pdf.js](https://mozilla.github.io/pdf.js/)); position saved to the page or the exact
  location.
- **Photos**: a timeline in justified rows, nested albums, favorites, a viewer with EXIF details,
  place and slideshow.
- **Collections, playlists and watch parties**: hand-made collections, playlists played in a row,
  watching together with synchronized playback, chat and reactions.
- **Account**: profiles with PINs and parental controls, passkeys, password, signed-in devices,
  pairing a TV with a code, statistics, year in review, history, offline downloads.
- **Administration**: overview, libraries, accounts, devices, activity, jobs, logs, Sonarr and
  Radarr, settings, backups, authentication (passkeys, OpenID Connect, device login), server
  themes, metrics, import from Jellyfin.
- **Themes**: colors, radius, density and font come from the profile's theme on the server; each
  device picks a style for layout and shapes, and can import a theme file
  ([guide](docs/themes.md)).
- **Languages**: English, French, German and Spanish, chosen per device or per profile.
- **Accessibility**: WCAG 2.2 AA is the target; every screen works with the keyboard and a screen
  reader.

## Installing

Each release comes with an archive of static files (`laterna-web-<version>.tar.gz` or `.zip`).
Serve them **on the same origin as the server**, behind a reverse proxy that sends the server's
routes to Laterna and everything else to the client:

| Paths | Go to |
|---|---|
| `/laterna.v1.*` (the API), `/images/`, `/playback/`, `/fonts/`, `/trickplay/`, `/books/`, `/downloads/`, `/logs/`, `/backups/`, `/hooks/`, `/auth/oidc/`, `/health`, `/metrics` | the server |
| everything else | the client's files, with `index.html` for any path that is not a file |

With [Caddy](https://caddyserver.com/), the client unpacked in `/srv/laterna-web` and the server
on port 8096:

```caddyfile
media.example.com {
	@server path /laterna.v1.* /images/* /playback/* /fonts/* /trickplay/* /books/* /downloads/* /logs/* /backups/* /hooks/* /auth/oidc/* /health /metrics
	handle @server {
		reverse_proxy localhost:8096 {
			flush_interval -1
		}
	}
	handle {
		root * /srv/laterna-web
		try_files {path} /index.html
		file_server
	}
}
```

Then, in the server's settings (Administration › Authentication), set the public address to that
origin (`https://media.example.com`): passkeys, OpenID Connect and the device login page use it.
Declare the proxy in the server's `trusted_proxies` and keep its streams unbuffered, as the
server's
[installation guide](https://github.com/laterna-project/laterna/blob/main/docs/install.md#behind-a-reverse-proxy)
explains.

To serve the client from another origin instead, build it yourself with the server's address in
`VITE_LATERNA_URL` (`VITE_LATERNA_URL=https://media.example.com pnpm build`) and allow that origin
in the server's `cors_origins`.

## Development

You need [Node.js](https://nodejs.org/) 22 or later, [pnpm](https://pnpm.io/) 11, and a Laterna
server to talk to: a checkout of the [server repository](https://github.com/laterna-project/laterna)
started with `task dev` serves on http://localhost:8096.

```sh
pnpm install
pnpm dev        # http://localhost:5173, proxies the API to LATERNA_URL (default http://localhost:8096)
pnpm check      # everything CI runs: generated code, lint, tests, build, type check
```

A new server has nothing to show: `pnpm samples` builds free sample libraries (about 5 GB, FFmpeg
needed) and `pnpm seed` sets up a new server with them. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md): development setup and the rules of the code base.
- [`docs/design/`](docs/design/README.md): how the client is built and why.
- [`docs/themes.md`](docs/themes.md): writing a theme file.
- [`docs/releasing.md`](docs/releasing.md): branches, versions and how a release is cut.

## License

Laterna Web is free software: you can redistribute it and modify it under the terms of the
[GNU General Public License](LICENSE) as published by the Free Software Foundation, either
version 3 of the License or, at your option, any later version. It comes with no warranty.

Each release archive lists the licenses of the bundled dependencies and fonts in
`THIRD_PARTY_LICENSES.md`.
