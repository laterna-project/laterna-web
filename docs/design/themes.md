# Themes

The look of the client comes from two layers, each with its own job:

- **the style of the device**: a CSS file chosen in "My account" (a built-in style or an imported
  theme). It keeps the layout, headings, special shapes (arched posters, book covers, records),
  universe colors, the player's stage and the reader's paper;
- **the theme of the profile**: design tokens kept by the server (server:
  docs/design/themes.md), chosen per profile and followed from one device to another. It gives
  backgrounds, text, accent, states, borders, `--color-scheme`, generic radii, density and the
  text font.

Colors are set in one place only: the server. A style can define color tokens, but the profile's
theme covers them.

## The token contract

`src/theme/contract.ts` lists every token a style defines: surfaces and inks, the accent, the
dark stage of the player and viewer, the reader's paper, one color per universe (movies, series,
music, books, photos, collections, playlists, party) with its ink, soft tint and text color,
states, typography, shapes, elevation, spacing and layout, motion.

Components only use these tokens through `var(--...)`. `contract.test.ts` checks both ways: each
built-in style defines exactly the tokens of the contract, style sheets use no unknown token, and
no color is written outside the theme files.

Two tokens carry choices that a token list would not otherwise express:

- `--color-accent` and `--color-accent-ink`: main action, selected item, progress.
- `--universe-fill`: how much of a universe's color large blocks take (banners, page headers, large
  cards). They get `color-mix(<universe color> <fill>, <surface>)` and a text mixed the same way
  (`universeBlock()` in `src/theme/universe.ts` for blocks styled from code). Small elements
  (badges, play buttons, avatars) keep the full color.

Headings use `--font-display` and `--weight-display`; shapes such as the arched poster
(`--radius-poster`: a half circle above a 2:3 rectangle) are only radii.

## Styles are CSS files

A style is one CSS file whose first comment is an `@laterna-theme` manifest (name, identifier,
author, version, description, base). The two built-in styles, "Universe" (the default) and "Magic
lantern", are files in `src/theme/themes/` in that same format, and imported themes follow it
too. The format, its rules and the hooks a theme can target are described for theme authors in
[docs/themes.md](../themes.md).

The chosen style (and the built-in style it is based on) is applied as style sheets adopted by
the document, outside any CSS layer, while every style sheet of the app is put in the `app` layer
by a Vite plugin (`devtools/vite/layer.ts`). A theme's rules therefore win over the components'
whatever their specificity, so a theme can restyle everything without a specificity race. Only the
styles the app sets inline (universe colors of a header, badges) need `!important`.

**Public hooks.** CSS module class names change from one version to the next, so they are not a
contract. Elements a theme may target carry a `data-ui` attribute from the list in
`src/theme/hooks.ts`, with `data-kind`, `data-universe`, `data-variant`, `data-tone`,
`data-shape`, `data-page` and ARIA states next to them. A test checks that the code sets no other
hook, that each hook is set somewhere, and that the authors' guide lists them all. Removing or
renaming a hook breaks themes: it is a change to note in the release notes.

**Imported themes are not trusted.** A theme is only CSS, never JavaScript, and it may load
nothing: no `@import`, and every address (`url(...)`, `image-set(...)`) must be `data:`, so fonts
and images are embedded. Without that rule, a style sheet could send what the page shows (a field's
value, through attribute selectors) to another server. The check runs on the file's text, then on
the style sheet as the browser parsed it, escapes resolved. A theme is limited to 1 MB and kept in
the device's local storage. The interface still warns to import themes from trusted sources only:
a theme can make anything look like something else.

## Server themes

A server theme is a set of tokens, never CSS: two palettes of twelve roles (dark and light), a
corner radius, a density, a font from a fixed list, and an optional logo and background.
`src/theme/server.ts` maps them onto the contract:

- **Palette.** `background` -> `--color-canvas`, `surface` -> `--color-surface`, `surface_raised`
  -> `--color-surface-sunken` (fields, chips, hover), `text` and `text_muted` -> `--color-ink`
  and `--color-ink-muted`, `accent`/`on_accent` -> `--color-accent`/`-ink`, `outline` ->
  `--color-line`, `error`/`on_error` -> `--color-danger`/`-ink`, `success`, `warning`. The
  remaining surface and line tokens are derived.
- **Soft tints and text colors.** The `-soft` tint of a state or universe is 14 % of the color on
  the surface (18 % for warnings). Its `-text` color is the color moved towards the ink just
  enough for 4.5:1 on the tint and on the surface, computed with the WCAG luminance formula
  rather than guessed: universe text colors designed for a light surface would not stay readable
  on a dark palette.
- **Radius.** `--radius-lg` is the theme's radius, the other generic radii scale with it. Pills
  and the style's special shapes do not move.
- **Density.** The style's `--space-*` scale by 0.8, 1 or 1.2. Layout sizes (gutters, control
  heights) do not, so touch targets stay those of the style.
- **Font.** `--font-sans`. Inter and Lexend are shipped with the app for that purpose (the server's
  list is fixed, so each client has to embed it); the browser only downloads a font a theme uses.
- **Mode.** A forced dark or light mode uses that palette; automatic mode uses both, the dark one
  under `@media (prefers-color-scheme: dark)`.

The result is a last adopted style sheet on `:root:root`, which wins over the `:root` rules of the
style and of an imported theme. It is rebuilt when the style changes (its universe colors and
base spacing are inputs). Two layers feed it: the server's theme (readable without signing in)
for the entry screens, and the profile's theme in the signed-in app, which wins. A
`ThemesChanged` event refetches `ThemeService`, so a theme edited or chosen elsewhere applies
without a reload. The last style sheet is kept on the device and reused at startup, so the page
does not flash the style's colors before the server answers.

The server refuses a palette whose contrast falls below WCAG 2.2 AA. The administration's theme
editor computes the same pairs and thresholds (`paletteProblems`) to say so before saving; the
server's refusal stays the reference.
