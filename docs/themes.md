# Writing a Laterna theme

A theme changes how the web client looks: heading fonts, shapes, and even the layout (a sidebar
menu, cards, grids, hidden elements). It is **a single CSS file**, imported in "My account" under
"Style of this device": it applies to that device and all its profiles, right away. The design is
explained in [docs/design/themes.md](design/themes.md).

**Colors come from the server.** The theme chosen by the profile, among the administrator's,
goes on top of yours: backgrounds, text, accent, states, borders, `--color-scheme`, generic radii
(`--radius-xs` to `--radius-2xl`), spacing (`--space-*`) and the text font (`--font-sans`). An
imported theme can define these tokens, but they are covered; write your rules with them
(`var(--color-accent)`) and they follow every palette, light or dark. The style keeps the layout,
headings (`--font-display`, `--weight-display`), the shapes of posters, covers and photos,
universe colors and their ink, the player's stage and the reader's paper.

A complete example to import: [`themes/console.css`](themes/console.css) (a terminal screen, a
menu on the left, square corners everywhere). References: the two built-in styles,
`src/theme/themes/universe.css` and `src/theme/themes/lantern.css`, which define every token.

## The file

It starts with a manifest, in the first comment:

```css
/* @laterna-theme
name: Neon
author: Sam
version: 1.0
description: Dark, pink and cyan neon.
base: lantern
*/

:root {
  --color-accent: #ff2d95;
  --font-display: Georgia, serif;
}

[data-ui="card"]:hover [data-ui="artwork"] {
  outline: 2px solid var(--color-accent);
}
```

| Field | |
| --- | --- |
| `name` | Required. The name shown. |
| `id` | Optional; derived from the name otherwise ("Pink Neon" -> `pink-neon`). Importing a theme with the same identifier again replaces it. The names of the built-in styles are reserved. |
| `author`, `version`, `description` | Optional, shown under the name. |
| `base` | Built-in style whose tokens apply before yours: `universe` (the default) or `lantern`. Only redefine what changes. |

## Rules

- **One file, nothing else**: no `@import`, and every address (`url(...)`, `image-set(...)`) must
  be `data:`. Fonts (`@font-face { src: url(data:font/woff2;base64,...) }`) and images are
  embedded. A theme that would load anything from elsewhere is refused: otherwise a style sheet
  could send what the page shows to another server.
- **1 MB at most**, fonts included.
- **No JavaScript**: a theme is only CSS.
- The app's fonts are already there: Plus Jakarta Sans, Literata, Atkinson Hyperlegible Next,
  Instrument Serif and Instrument Sans, Inter and Lexend (`font-family` with their name, the
  "Variable" variant included).

## What wins

The app's styles are in the CSS layer `app`; the theme is applied outside any layer. **Its rules
therefore win over the components', whatever their specificity.** Only the styles the app sets
inline (the universe color of a page header, badges, play buttons) need `!important`. The server
theme comes after, on `:root:root`: its tokens win over those of the imported theme.

## Tokens

Components only take their values from tokens (`var(--...)`): changing them is often enough. The
full list and the role of each: `src/theme/contract.ts`. In short:

- surfaces and inks: `--color-canvas`, `--color-surface`, `--color-ink`, `--color-ink-muted`...;
- accent (main action, selected item): `--color-accent`, `--color-accent-ink`;
- `--color-scheme`: `light` or `dark`, for the browser's controls and the reader's background;
- universes (movies, series, music, books, photos, collections, playlists, party):
  `--color-<universe>`, `-ink`, `-soft`, `-text`; `--universe-fill` says how much of that color
  large surfaces take (0 %: none, 100 %: full);
- stage (player, photo viewer): `--color-stage...`; the reader's paper: `--color-paper...` (and the
  backgrounds `[data-paper="sepia"]`, `"night"`, `"paper"`);
- typography (`--font-*`, `--text-*`, `--weight-*`), shapes (`--radius-*`, including
  `--radius-poster` for posters), elevation (`--shadow-*`, `--focus-ring`), spacing and layout
  (`--space-*`, `--page-gutter`, `--page-max`, `--header-height`), motion.

For a narrow screen: `@media (max-width: 767px) { :root { ... } }`.

## Hooks

Component class names change from one version to the next; the `data-ui` attributes are the
contract. They come with:

- `data-kind`: the kind of card (`movie`, `series`, `episode`, `resume`, `album`, `artist`,
  `book`, `book-series`, `photo`, `collection`, `playlist`, `upcoming`) or of reader (`epub`,
  `pages`);
- `data-universe`: the universe of a card, a section, a header;
- `data-variant` (buttons: `primary`, `secondary`, `quiet`), `data-tone` (messages),
  `data-shape` (images: `poster`, `cover`, `disc`, `round`, `photo`...);
- `data-page` on `main`: the section shown (`home`, `movies`, `series`, `music`, `bookshelf`,
  `photos`, `collections`, `playlists`, `account`, `admin`...), and on entry pages (`setup`,
  `login`, `profiles`, `device`);
- ARIA states: `aria-current="page"` (section, selected item), `aria-selected` (tab),
  `aria-pressed` (filter), `aria-expanded` (open menu), `disabled`.

| Hook | Element |
| --- | --- |
| `app` | Shell of the signed-in app: header, content, music player. |
| `header` | Header: logo, sections, search, profile. |
| `home-link` | Logo link to the home page. |
| `logo` | Laterna brand (dots and name). |
| `nav` | Navigation: header sections, administration menu. |
| `nav-link` | A section (aria-current="page" when shown; data-universe). |
| `nav-more` | "More" button of the secondary sections (aria-expanded). |
| `menu` | Drop-down menu ("More", profile). |
| `menu-item` | Item of a drop-down menu. |
| `header-tools` | Search, notifications and profile group, on the right of the header. |
| `tab-bar` | Phones: bar of the sections at the bottom of the screen, instead of the header's. |
| `tab-bar-link` | A section of the bar (aria-current="page" when shown; data-universe). |
| `tab-bar-more` | "More" button of the bar: the other sections (aria-expanded). |
| `search-button` | Search button of the header. |
| `notifications-button` | Bell of the header, to the notifications (aria-current="page" when shown). |
| `profile-button` | Profile badge that opens its menu. |
| `main` | Page content (data-page: home, movies, series, music, bookshelf, photos, admin...). |
| `skip-link` | "Skip to content" link, visible with the keyboard. |
| `entry` | Entry pages: setup, login, profile choice, device pairing (data-page). |
| `profile-tile` | A profile on the "Who's watching?" page. |
| `button` | Button (data-variant: primary, secondary, quiet). |
| `field` | Input with its label. |
| `switch` | Switch with its label. |
| `alert` | Error or information message (data-tone: danger, info). |
| `dialog` | Modal dialog. |
| `panel` | Card surface of form screens. |
| `avatar` | Profile badge (data-universe). |
| `artwork` | Catalog image (data-shape: poster, cover, disc, round, photo...). |
| `badge` | Small mark on a card or a button: watched, favorite, episode, release date, unread count. |
| `progress` | Progress bar over an image. |
| `chip` | Filter chip: library, genre (aria-pressed). |
| `actions` | Row of buttons of a detail page or a panel. |
| `home` | Home page. |
| `home-intro` | Greeting and summary of the home page. |
| `home-block` | Home block: one row, or rows in tabs. |
| `block-head` | Head of a block: title, tabs, "See all", arrows. |
| `block-title` | Title of a block. |
| `tabs` | Tabs of a block (role=tablist). |
| `tab` | A tab (aria-selected; data-universe). |
| `strip` | Scrolling strip of cards. |
| `strip-arrow` | Arrow that scrolls a strip (disabled at the edge). |
| `see-all` | "See all" link. |
| `browse` | List page of a section (movies, series, music, books). |
| `page-header` | Page header (data-universe when it has one). |
| `filters` | Sort and filters of a list. |
| `grid` | Grid of cards. |
| `load-more` | Counter and "Show more" button. |
| `card` | Card (data-kind: movie, series, episode, resume, album, artist, book, book-series, photo, collection, playlist, upcoming; data-universe). |
| `card-title` | Title of a card. |
| `card-meta` | Secondary line of a card. |
| `card-play` | Play button on a card. |
| `side-panel` | Side panel of a page: chosen book, playlists. |
| `detail-hero` | Top of a detail page (movie, series, episode; data-universe). |
| `detail-backdrop` | Backdrop image of a detail page. |
| `detail-card` | Card of a detail page: poster, title, overview, buttons. |
| `detail-section` | Section of a detail page: episodes, cast, files. |
| `cast` | Cast. |
| `episode-list` | Episodes of a season. |
| `episode` | An episode of the list. |
| `track-list` | List of tracks. |
| `track` | A track (aria-current while it plays). |
| `mini-player` | Floating music player. |
| `queue` | Music queue. |
| `seek` | Seek bar (video, music). |
| `photo-day` | A day of the photo timeline. |
| `photo-grid` | Justified rows of photos. |
| `viewer` | Photo viewer. |
| `viewer-top` | Top of the viewer. |
| `viewer-panel` | Information about a photo. |
| `viewer-strip` | Strip of neighboring photos. |
| `player` | Full-screen video player. |
| `player-top` | Top of the player: back, title. |
| `player-bottom` | Bottom of the player: seek bar, controls. |
| `player-controls` | Player controls. |
| `player-panel` | Player panel: audio and subtitles, episodes. |
| `reader` | Book reader (data-kind: epub, pages). |
| `reader-top` | Top of the reader. |
| `reader-panel` | Reader panel: settings, table of contents. |
| `playlist-entry` | An entry of a playlist. |
| `party-stage` | Picture of a watch party. |
| `party-panel` | Panel of a watch party: members, queue, chat. |
| `chat` | Chat of a watch party. |
| `download` | A downloaded file. |
| `notification` | A notification of the list (data-unread while it is not read). |
| `theme-picker` | Theme choice in "My account". |
| `admin` | Administration: sidebar and content. |
| `admin-side` | Administration sidebar. |
| `admin-menu-button` | Narrow screens: button that opens the administration menu (aria-expanded). |

## Before sharing a theme

- Contrast: text on its background at 4.5:1 at least (3:1 for large headings), and a clearly
  visible focus ring (`--focus-ring`). In development, `await laternaAudit()` in the console checks
  the current page.
- Reduced motion: respect `@media (prefers-reduced-motion: reduce)`.
- Try the full-screen pages (player, readers, photo viewer), which have their own hooks.
