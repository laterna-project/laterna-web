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
| 0.4.x | 0.5.x to 0.7.x |
| 0.3.x | 0.5.x; 0.1.x to 0.4.x without the subtitle setting |
| 0.2.x | 0.1.x to 0.4.x |
| 0.1.x | 0.1.x to 0.4.x |

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
- **Requests**: search for a movie or a series the server doesn't have, ask for it (the whole
  series or some seasons) and follow it until it can be watched.
- **Account**: profiles with PINs and parental controls, passkeys, password, signed-in devices,
  pairing a TV with a code, statistics, year in review, history, offline downloads.
- **Administration**: overview, libraries, accounts, requests (approval queue and where they land
  on Sonarr and Radarr), devices, activity, jobs, logs, Sonarr and Radarr, settings, backups,
  authentication (passkeys, OpenID Connect, device login), server themes, metrics, import from
  Jellyfin.
- **Themes**: colors, radius, density and font come from the profile's theme on the server; each
  device picks a style for layout and shapes, and can import a theme file
  ([guide](docs/themes.md)).
- **Languages**: English, French, German and Spanish, chosen per device or per profile.
- **Accessibility**: WCAG 2.2 AA is the target; every screen works with the keyboard and a screen
  reader.
- **Every screen size**: phones, tablets and computers, in a browser tab or
  [installed as an app](#installing-the-app-on-a-device).

## Installing

**With the server's Docker image**, version 0.2.0 or later, there is nothing to install: the image
includes the client. Open the server's address (http://localhost:8096 on the server itself).

**On other installations of the server**, download the archive of a release
(`laterna-web-<version>.tar.gz` or `.zip`), unpack it, and point the server at the folder with
`paths.web` in its configuration or `LATERNA_WEB_DIR`. The server's
[installation guide](https://github.com/laterna-project/laterna/blob/main/docs/install.md#the-web-client)
explains it.

**Behind your own reverse proxy**, serve the client's files **on the same origin as the server**,
and send the server's routes to Laterna:

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

When the server serves the client itself, the same proxy is simpler: everything goes to the
server (`reverse_proxy localhost:8096`, with `flush_interval -1`).

Then, in the server's settings (Administration › Authentication), set the public address to that
origin (`https://media.example.com`): passkeys, OpenID Connect and the device login page use it.
Declare the proxy in the server's `trusted_proxies` and keep its streams unbuffered, as the
server's
[installation guide](https://github.com/laterna-project/laterna/blob/main/docs/install.md#behind-a-reverse-proxy)
explains.

To serve the client from another origin instead, build it yourself with the server's address in
`VITE_LATERNA_URL` (`VITE_LATERNA_URL=https://media.example.com pnpm build`) and allow that origin
in the server's `cors_origins`.

## Installing the app on a device

The client installs as an app on phones, tablets and computers: its own icon and window, without
the browser's bars, and a "Server unreachable" page of its own when the server cannot be reached.
It updates with the server.

| Devices | Browsers | How |
|---|---|---|
| Android phones and tablets | Chrome, Edge, Samsung Internet, Firefox | Menu › Install app (or Add to home screen) |
| iPhone and iPad, iOS and iPadOS 16.4 or later | Safari; from 16.4, also Chrome, Edge and Firefox | Share › Add to Home Screen |
| Windows 10 and 11, Linux, ChromeOS | Chrome, Edge and other Chromium browsers | The install button of the address bar, or Menu › Install |
| macOS 14 or later | Safari 17 or later; Chrome, Edge | File › Add to Dock in Safari |

Browsers only install apps served over **HTTPS**: a server reached at `http://192.168.x.y:8096`
works in a browser tab but cannot be installed. A reverse proxy with a certificate, such as Caddy
above, fixes that. Firefox on a computer may not offer to install it; the client works there in a
tab. TVs are not covered: they need apps of their own.

[docs/design/devices.md](docs/design/devices.md) explains the layouts, the service worker and what
differs on iPhone.

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
