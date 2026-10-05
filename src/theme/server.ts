// Server themes (docs/design/themes.md, here and in the server): design tokens (two
// palettes, corner radius, density, font) that the client maps to its contract. They give colors
// and radius on top of the device's style (Universe, Magic lantern, an imported theme), which keeps
// the layout, special shapes (posters, covers) and universe colors. No browser needed; tested in
// server.test.ts.
import {
  type Palette,
  ThemeDensity,
  ThemeFont,
  ThemeMode,
  type ThemeTokens,
} from "../gen/laterna/v1/theme_pb";
import i18n, { locale } from "../i18n";
import { type Universe, universes } from "./contract";

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Mix of two colors ("#rrggbb"): share of a, from 0 to 1. */
export function mix(a: string, b: string, part: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex([0, 1, 2].map((i) => (x[i] as number) * part + (y[i] as number) * (1 - part)) as Rgb);
}

/** Relative luminance (WCAG 2.2). */
function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colors (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The color, moved towards the ink just enough to be readable on each background (4.5:1 by
 * default): a universe's text on its soft tint, a state's on its own.
 */
export function readable(color: string, ink: string, backgrounds: readonly string[], min = 4.5): string {
  for (let step = 0; step <= 20; step++) {
    const c = mix(ink, color, step / 20);
    if (backgrounds.every((bg) => contrast(c, bg) >= min)) return c;
  }
  return ink;
}

export type Scheme = "dark" | "light";

/** Role in a palette: one of its colors. */
export type PaletteRole = Exclude<keyof Palette, "$typeName" | "$unknown">;

/** Palette roles, in the server's order. */
export const roles: readonly PaletteRole[] = [
  "background",
  "surface",
  "surfaceRaised",
  "text",
  "textMuted",
  "accent",
  "onAccent",
  "outline",
  "error",
  "onError",
  "success",
  "warning",
];

/** Name of a role in plain words: "Background", "Text on accent". */
export function roleName(role: PaletteRole): string {
  return i18n.t(`serverTheme.roles.${role}`);
}

const pairs: readonly [PaletteRole, PaletteRole, number][] = [
  ["text", "background", 4.5],
  ["text", "surface", 4.5],
  ["text", "surfaceRaised", 4.5],
  ["textMuted", "background", 4.5],
  ["textMuted", "surface", 4.5],
  ["onAccent", "accent", 4.5],
  ["onError", "error", 4.5],
  ["accent", "background", 3],
  ["error", "background", 3],
  ["success", "background", 3],
  ["warning", "background", 3],
];

/**
 * Insufficient contrasts of a palette, as the server refuses them (WCAG 2.2 AA), reported before
 * saving: "Text on background: 3.1:1, at least 4.5:1".
 */
export function paletteProblems(p: Palette): string[] {
  return pairs.flatMap(([fg, bg, min]) => {
    const c = contrast(p[fg], p[bg]);
    return c + 1e-9 < min
      ? [
          i18n.t("serverTheme.contrast", {
            fg: roleName(fg),
            bg: roleName(bg).toLowerCase(),
            ratio: c.toLocaleString(locale(), { maximumFractionDigits: 2 }),
            min: min.toLocaleString(locale()),
          }),
        ]
      : [];
  });
}

/** Contract colors given by a palette; universe: the style's universe colors. */
export function paletteTokens(
  p: Palette,
  scheme: Scheme,
  universe: Partial<Record<Universe, string>>,
): Record<string, string> {
  const soft = (color: string, part = 0.14) => mix(color, p.surface, part);
  const tokens: Record<string, string> = {
    "--color-canvas": p.background,
    "--color-surface": p.surface,
    "--color-surface-sunken": p.surfaceRaised,
    "--color-surface-muted": mix(p.surface, p.background, 0.5),
    "--color-track": mix(p.outline, p.surface, 0.6),
    "--color-line": p.outline,
    "--color-line-strong": mix(p.textMuted, p.outline, 0.4),
    "--color-ink": p.text,
    "--color-ink-muted": p.textMuted,
    "--color-ink-inverse": p.background,
    "--color-accent": p.accent,
    "--color-accent-ink": p.onAccent,
    "--color-scheme": scheme,
    "--color-danger": p.error,
    "--color-danger-ink": p.onError,
    "--color-danger-soft": soft(p.error),
    "--color-danger-text": readable(p.error, p.text, [soft(p.error), p.surface]),
    "--color-success": p.success,
    "--color-success-soft": soft(p.success),
    "--color-success-text": readable(p.success, p.text, [soft(p.success), p.surface]),
    "--color-warning-soft": soft(p.warning, 0.18),
    "--color-warning-text": readable(p.warning, p.text, [soft(p.warning, 0.18), p.surface]),
  };
  for (const u of universes) {
    const color = universe[u];
    if (!color || !/^#[0-9a-f]{3,8}$/i.test(color)) continue;
    tokens[`--color-${u}-soft`] = soft(color);
    tokens[`--color-${u}-text`] = readable(color, p.text, [soft(color), p.surface]);
  }
  return tokens;
}

/** Proportions of the contract's radii, relative to the theme's radius ("lg"). */
const radii: readonly [string, number][] = [
  ["--radius-xs", 0.3],
  ["--radius-sm", 0.6],
  ["--radius-md", 0.8],
  ["--radius-lg", 1],
  ["--radius-xl", 1.4],
  ["--radius-2xl", 1.6],
];

const spaces = [
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-8",
  "--space-10",
];

const densities: Record<ThemeDensity, number> = {
  [ThemeDensity.UNSPECIFIED]: 1,
  [ThemeDensity.COMPACT]: 0.8,
  [ThemeDensity.COMFORTABLE]: 1,
  [ThemeDensity.SPACIOUS]: 1.2,
};

/** Fonts of the server's list, served by the app (falling back to system fonts). */
export const fontStacks: Record<ThemeFont, string> = {
  [ThemeFont.UNSPECIFIED]: "",
  [ThemeFont.SYSTEM]: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  [ThemeFont.INTER]: '"Inter Variable", "Inter", system-ui, sans-serif',
  [ThemeFont.ATKINSON]:
    '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible", system-ui, sans-serif',
  [ThemeFont.LEXEND]: '"Lexend Variable", "Lexend", system-ui, sans-serif',
  [ThemeFont.SERIF]: '"Literata Variable", Georgia, "Times New Roman", serif',
};

const fontKeys = {
  [ThemeFont.UNSPECIFIED]: "unspecified",
  [ThemeFont.SYSTEM]: "system",
  [ThemeFont.INTER]: "inter",
  [ThemeFont.ATKINSON]: "atkinson",
  [ThemeFont.LEXEND]: "lexend",
  [ThemeFont.SERIF]: "serif",
} as const;

/** Name of a font of the server's list. */
export function fontName(font: ThemeFont): string {
  return i18n.t(`serverTheme.fonts.${fontKeys[font] ?? "unspecified"}`);
}

/**
 * Radius, density and font of the theme. base: the style's tokens (spacing in px), scaled by the
 * density; the theme's font becomes the text font, headings keep the style's.
 */
export function shapeTokens(t: ThemeTokens, base: Record<string, string>): Record<string, string> {
  const tokens: Record<string, string> = {};
  const r = Math.min(24, Math.max(0, t.radius));
  for (const [name, part] of radii) tokens[name] = `${Math.round(r * part * 10) / 10}px`;
  const scale = densities[t.density] ?? 1;
  if (scale !== 1)
    for (const name of spaces) {
      const px = Number.parseFloat(base[name] ?? "");
      if (Number.isFinite(px)) tokens[name] = `${Math.round(px * scale)}px`;
    }
  const font = fontStacks[t.font];
  if (font) tokens["--font-sans"] = font;
  return tokens;
}

function block(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
}

/**
 * Style sheet of the server theme, applied after the style's: ":root:root" wins over the ":root" of
 * the style and of an imported theme. In automatic mode, the palette follows the device.
 */
export function serverThemeCss(t: ThemeTokens, mode: ThemeMode, base: Record<string, string>): string {
  const universe = Object.fromEntries(universes.map((u) => [u, base[`--color-${u}`] ?? ""]));
  const shape = shapeTokens(t, base);
  const of = (scheme: Scheme) => {
    const palette = scheme === "dark" ? t.dark : t.light;
    return palette ? { ...paletteTokens(palette, scheme, universe), ...shape } : shape;
  };
  if (mode === ThemeMode.DARK) return `:root:root {\n${block(of("dark"))}\n}\n`;
  if (mode === ThemeMode.LIGHT) return `:root:root {\n${block(of("light"))}\n}\n`;
  return `:root:root {\n${block(of("light"))}\n}\n@media (prefers-color-scheme: dark) {\n  :root:root {\n${block(of("dark"))}\n  }\n}\n`;
}
