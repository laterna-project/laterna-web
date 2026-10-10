# Devices and the installed app

The client is the Laterna app for phones, tablets and computers: one web app, used in a browser
tab or installed as an app (a progressive web app). There are no native phone or tablet apps to
keep in step with it. TVs are the exception: a remote control, a ten-foot interface and the
formats a TV plays call for native apps, which this client does not try to replace.

## Where it installs

| Devices | Browsers that install it | How |
|---|---|---|
| Android phones and tablets | Chrome, Edge, Samsung Internet, Firefox | Menu › Install app (or Add to home screen) |
| iPhone and iPad, iOS and iPadOS 16.4 or later | Safari; from 16.4, also Chrome, Edge and Firefox | Share › Add to Home Screen |
| Windows 10 and 11, Linux, ChromeOS | Chrome, Edge and other Chromium browsers | The install button of the address bar, or Menu › Install |
| macOS 14 or later | Safari 17 or later; Chrome, Edge | File › Add to Dock in Safari |

Firefox on a computer may not offer to install it; the client works there in a tab. Older iOS
versions are out: the client needs Safari 16.4, for the manifest and for the constructable style
sheets that carry the themes.

Browsers only install an app served over HTTPS (or from the computer itself, `localhost`). A
server reached at `http://192.168.x.y:8096` works in a browser tab but cannot be installed; a
reverse proxy with a certificate fixes that (the README shows one with Caddy).

## What makes it an app

**The manifest** (`public/manifest.json`): name, standalone window, the default theme's canvas as
the splash and bar color, icons. It is a `.json` file because every server knows that type, while
`.webmanifest` is missing from the type table of some, the Laterna server's included.

**The icons** are the logo's four dots on a dark tile (`src/ui/Logo.tsx`). `scripts/icons.mjs`
draws every size from the same shapes, without a dependency: the SVG and ICO favicons, the
192 and 512 px icons of the manifest, the maskable icon Android crops to its own shape, and the
touch icon of iPhones and iPads (a square: iOS rounds it, and fills transparent pixels with
black). The files are committed in `public/`; `pnpm icons` draws them again after a change.

**The page** (`index.html`) covers the whole screen (`viewport-fit=cover`) and names the app for
iOS. The color of the system bars (`theme-color`) follows the theme's canvas, light or dark, and
turns to the dark stage while a player or a viewer fills the screen (`barColor` in
`src/theme/theme.ts`).

**The service worker** (`src/app/sw.ts`) lets the app start when the server cannot be reached, and
show its own "Server unreachable" page with a retry button, not the browser's error page.

- On install, it keeps the page, the scripts and styles the page loads, and the language
  catalogs: the first screen, about 1 MB. Any other built file is kept the first time it loads.
- Pages always come from the server first; the kept page is only used when the server does not
  answer. The server's data never goes through the worker: API calls and byte routes (images,
  streams, books, downloads) always go to the network, with their own access rules.
- Each build has its own cache, named after a hash of all its files. A new version takes over as
  soon as it is installed and deletes the previous cache. A page of the previous version still
  open then misses the files it had not loaded yet: it reloads into the new version
  (`vite:preloadError` in `src/main.tsx`).
- It is written in TypeScript with the few worker types it needs declared by hand, and built into
  `/sw.js` by a plugin of ours (`devtools/vite/service-worker.ts`) that adds the build's file list.
  A PWA plugin with Workbox would be far larger than the few dozen lines it replaces.
- It only exists in the build: in development, Vite serves the files itself.

What the installed app does not do: play without the network (downloads are files saved on the
device, for any player), or sync in the background.

## Notifications

A profile's notifications (server: `docs/design/notifications.md`) are a list every device shows
alike: the bell of the header counts the unread ones and opens the page. The server announces
each change on the event stream, and the list is read again.

A device can also be told while the app is closed, by **web push**. "Notify this device", on the
notifications page, asks the browser for permission, subscribes it at its push service with the
server's key and hands the subscription to the server (`src/features/notifications/push.ts`).
Each device decides for itself, and the subscription goes away when the device signs out.

- The service worker shows what arrives. The server writes the text in the language of the
  profile, so the worker needs no catalog: it shows the server's name and the sentence.
- A click opens the app on `/notifications?open=<notification>`. The list knows what the
  notification names (an episode, a movie, a request), marks it read and opens it. An app that is
  already open is told through a message and brought to the front, without a reload.
- Browsers renew subscriptions on their own. When the app opens and the browser's subscription is
  no longer the one the server holds, the new one is handed over, without asking anything.
- It needs what installing needs: HTTPS, or the computer itself. On an iPhone or iPad, web push
  only exists for an app added to the home screen (iOS 16.4 or later). Where it cannot work, the
  switch says so and stays off.
- A server without push (before 0.10) shows neither the bell nor the switch.

## Layouts

| Screen | Navigation |
|---|---|
| Phones, under 768 px | A tab bar at the bottom: the first four sections, the others under "More" with collections, playlists and watch parties. The header keeps the logo, search and profile. |
| Tablets held upright, under 1024 px with a touch screen | The same bar, with every section. |
| Computers, tablets held sideways | The header's sections, on one line from 1200 px, on a second line below. |

The tab bar is the navigation of phone apps, within reach of the thumb. On a computer the header
stays, even in a narrow window: the media query is
`(max-width: 767px), (max-width: 1023px) and (pointer: coarse)`, written in each style sheet that
depends on the bar (`src/routes/app.module.css` holds the bar). What floats at the bottom of the
screen, the music player and the photo selection bar, sits above it.

The administration keeps its sidebar from 901 px; below, a button naming the section shown opens
the menu.

**Safe areas.** With the page under the notch and the home bar, the app keeps its controls out of
them with `env(safe-area-inset-*)`: the page's sides when a phone is held sideways, the tab bar,
the music player, and the screens that fill the screen (player, readers, photo viewer, watch
party).

**Touch.** Text fields are at least 16 px on touch screens: Safari zooms into the page when a
smaller field gets focus (`src/theme/global.css`; a field designed bigger carries `data-large`).
Touching the video shows the controls instead of pausing.

## iPhone and iPad

Safari on iPhone has no Media Source Extensions (iOS 17.1 added ManagedMediaSource, still not
MediaSource), which hls.js needs. On iPhone, the player hands HLS streams to Safari itself
(`src/player/media.ts`) and asks the video element which codecs it plays
(`src/player/deviceProfile.ts`). iPads and Macs have Media Source Extensions and use hls.js like
other browsers.

A page cannot go full screen on iPhone: the full screen button opens Safari's own player, with its
controls. WebVTT subtitles show there; styled ASS subtitles (JASSUB) only outside full screen. On
phones and tablets that can, full screen turns a wide video sideways.

iOS shows no install prompt: the app is added from the Share menu. Safari erases the data of a
site not visited for seven days, the session included; an app added to the Home Screen keeps it.

## Limits we know

- A browser plays fewer formats than a native player: Matroska outside Chrome, DTS, TrueHD or
  Dolby Vision send more files through the server's conversion.
- Playing in the background, the screen locked, depends on the system. The music player gives its
  controls to the system (Media Session).
- The system may clear an installed app's storage when space runs low: the device then signs in
  again.
