// Theme contract (docs/design/themes.md): the complete list of tokens a theme defines. Components
// only use these tokens (var(--...)); a theme defines no other. Tests check both directions, and
// that no color is hard-coded outside the theme files.

/** Media universes: each has its color, the ink placed on it, a soft tint and its text on that tint. */
export const universes = [
  "movies",
  "series",
  "music",
  "books",
  "photos",
  "collections",
  "playlists",
  "party",
] as const;
export type Universe = (typeof universes)[number];

const universeTokens = universes.flatMap((u) => [
  `--color-${u}`,
  `--color-${u}-ink`,
  `--color-${u}-soft`,
  `--color-${u}-text`,
]);

export const tokens = [
  // Surfaces and inks
  "--color-canvas",
  "--color-surface",
  "--color-surface-sunken",
  "--color-surface-muted",
  "--color-track",
  "--color-line",
  "--color-line-strong",
  "--color-ink",
  "--color-ink-muted",
  "--color-ink-inverse",
  "--color-scrim",
  // Accent: main action, selected item, progress; and its ink
  "--color-accent",
  "--color-accent-ink",
  // "light" or "dark": native browser controls (select lists, scrollbars)
  "--color-scheme",
  // Share of the universe color in a block (banner, header): 100 % = full color
  "--universe-fill",
  // Stage: video player, page reader, photo viewer
  "--color-stage",
  "--color-stage-raised",
  "--color-stage-ink",
  "--color-stage-ink-muted",
  // Reader paper: light by default, sepia and night under [data-paper]
  "--color-paper",
  "--color-paper-ink",
  "--color-paper-muted",
  "--color-paper-chip",
  ...universeTokens,
  // States
  "--color-danger",
  "--color-danger-ink",
  "--color-danger-soft",
  "--color-danger-text",
  "--color-success",
  "--color-success-soft",
  "--color-success-text",
  "--color-warning-soft",
  "--color-warning-text",
  // Typography
  "--font-sans",
  "--font-display",
  "--font-reading",
  "--font-legible",
  "--font-mono",
  "--text-xs",
  "--text-sm",
  "--text-md",
  "--text-lg",
  "--text-xl",
  "--text-2xl",
  "--text-3xl",
  "--text-4xl",
  "--weight-regular",
  "--weight-strong",
  "--weight-heavy",
  "--weight-display",
  "--tracking-tight",
  "--tracking-display",
  "--leading-tight",
  "--leading-normal",
  // Shapes
  "--radius-xs",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-xl",
  "--radius-2xl",
  "--radius-pill",
  "--radius-poster",
  "--radius-cover",
  "--radius-photo",
  "--radius-disc",
  // Elevation
  "--shadow-card",
  "--shadow-overlay",
  "--shadow-floating",
  "--focus-ring",
  // Spacing and layout
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-8",
  "--space-10",
  "--page-gutter",
  "--page-max",
  "--header-height",
  "--control-sm",
  "--control-md",
  "--control-lg",
  // Motion
  "--duration-fast",
  "--duration-normal",
  "--ease-standard",
] as const;

export type Token = (typeof tokens)[number];

/**
 * Built-in themes: one file src/theme/themes/<id>.css each, in the format of imported themes,
 * defining every token.
 */
export const builtInThemeIds = ["universe", "lantern"] as const;
