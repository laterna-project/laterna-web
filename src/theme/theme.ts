// Themes of this device (docs/design/themes.md): the built-in themes and those imported in "My
// account", all in the same format (src/theme/format.ts). The chosen theme is applied as style
// sheets adopted by the document, outside the "app" layer of the app's styles, so its rules always
// win over the components'. The server theme (docs/design/themes.md) goes on top: a last style
// sheet with its colors, radius, density and font.
import i18n, { list } from "../i18n";
import { parseManifest, remoteUrls, type ThemeManifest, themeProblems } from "./format";
import { serverThemeCss } from "./server";
import { activeLayer, subscribeServerTheme } from "./serverLayer";
import lantern from "./themes/lantern.css?raw";
import universe from "./themes/universe.css?raw";

export interface Theme extends ThemeManifest {
  css: string;
  /** Ships with the app (cannot be removed). */
  builtIn: boolean;
}

/** Starting theme, and base of an imported theme that names none. */
export const defaultTheme = "universe";

const activeKey = "laterna.theme";
const importedKey = "laterna.themes";
// Last style sheet of the server theme, reused at startup before the server answers.
const serverKey = "laterna.theme.server";

function builtIn(css: string): Theme {
  const manifest = parseManifest(css);
  if (typeof manifest === "string") throw new Error(manifest);
  return { ...manifest, base: undefined, css, builtIn: true };
}

/** Built-in themes, in the order they are offered. */
export const builtInThemes: readonly Theme[] = [builtIn(universe), builtIn(lantern)];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Themes imported on this device (unreadable files are ignored). */
export function importedThemes(): Theme[] {
  try {
    const list: unknown = JSON.parse(read(importedKey) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.flatMap((css) => {
      if (typeof css !== "string") return [];
      const manifest = parseManifest(css);
      return typeof manifest === "string" ? [] : [{ ...manifest, css, builtIn: false }];
    });
  } catch {
    return [];
  }
}

/** All themes offered: built-in, then imported. */
export function allThemes(): Theme[] {
  return [...builtInThemes, ...importedThemes()];
}

function find(id: string | null): Theme | undefined {
  return allThemes().find((t) => t.id === id);
}

/** Theme saved on this device, otherwise the default one. */
export function savedTheme(): string {
  return find(read(activeKey))?.id ?? defaultTheme;
}

const sheets = new Map<string, CSSStyleSheet>();
let applied: CSSStyleSheet[] = [];

function sheetOf(theme: Theme): CSSStyleSheet {
  let sheet = sheets.get(theme.css);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(theme.css);
    sheets.set(theme.css, sheet);
  }
  return sheet;
}

/** The theme and its base, in the order their style sheets apply. */
function chain(theme: Theme): Theme[] {
  if (theme.builtIn) return [theme];
  const base = builtInThemes.find((t) => t.id === (theme.base ?? defaultTheme)) ?? builtInThemes[0];
  return base ? [base, theme] : [theme];
}

/** Applies a theme to the page and remembers it on this device. */
export function applyTheme(id: string): void {
  const theme = find(id) ?? find(defaultTheme);
  if (!theme) return;
  const next = chain(theme).map(sheetOf);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets.filter((s) => !applied.includes(s)), ...next];
  applied = next;
  document.documentElement.dataset.theme = theme.id;
  try {
    localStorage.setItem(activeKey, theme.id);
  } catch {
    // Storage unavailable (private browsing): the theme lasts for this visit.
  }
  // The server's style sheet depends on the style (universe colors, spacing): computed again, and
  // put back last.
  refreshServerSheet(theme);
}

// --- Server theme --------------------------------------------------------------------------------

// Computed again on each layer change (server or profile theme, src/theme/serverLayer.ts).
subscribeServerTheme(() => refreshServerSheet(find(savedTheme())));
let serverSheet: CSSStyleSheet | null = null;

function refreshServerSheet(style: Theme | undefined): void {
  const active = activeLayer();
  let css: string | null = null;
  if (active?.theme.tokens && style)
    css = serverThemeCss(active.theme.tokens, active.mode, themeTokens(style));
  else if (!active) css = read(serverKey);
  if (css === null) {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== serverSheet);
    return;
  }
  serverSheet ??= new CSSStyleSheet();
  serverSheet.replaceSync(css);
  document.adoptedStyleSheets = [
    ...document.adoptedStyleSheets.filter((s) => s !== serverSheet),
    serverSheet,
  ];
  if (active)
    try {
      localStorage.setItem(serverKey, css);
    } catch {
      // Without storage, the first render waits for the server.
    }
}

/** Follows changes made in another tab (theme chosen, imported or removed). */
export function watchTheme(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === activeKey || e.key === importedKey) applyTheme(savedTheme());
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/**
 * Reads and checks a theme file, then keeps it on this device (a theme with the same identifier is
 * replaced). Throws an error with a readable message if the file is not suitable.
 */
export async function importTheme(file: File): Promise<Theme> {
  const css = await file.text();
  const manifest = parseManifest(css);
  if (typeof manifest === "string") throw new Error(manifest);
  if (builtInThemes.some((t) => t.id === manifest.id)) {
    throw new Error(i18n.t("themeFile.reserved", { id: manifest.id }));
  }
  if (manifest.base !== undefined && !builtInThemes.some((t) => t.id === manifest.base)) {
    const names = list(
      builtInThemes.map((t) => t.id),
      "disjunction",
    );
    throw new Error(i18n.t("themeFile.unknownBase", { base: manifest.base, names }));
  }
  const problems = themeProblems(css);
  // The style sheet as the browser reads it: escapes (\75 rl...) are resolved.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const parsed = Array.from(sheet.cssRules, (r) => r.cssText).join("\n");
  if (problems.length === 0 && remoteUrls(parsed).length > 0) {
    problems.push(i18n.t("themeFile.remoteParsed"));
  }
  if (problems.length === 0 && sheet.cssRules.length === 0) {
    problems.push(i18n.t("themeFile.empty"));
  }
  if (problems.length > 0) throw new Error(problems.join(" "));

  const theme: Theme = { ...manifest, css, builtIn: false };
  const others = importedThemes().filter((t) => t.id !== theme.id);
  try {
    localStorage.setItem(importedKey, JSON.stringify([...others, theme].map((t) => t.css)));
  } catch {
    throw new Error(i18n.t("themeFile.noSpace"));
  }
  return theme;
}

/** Removes an imported theme; if it was chosen, the device goes back to the default theme. */
export function removeTheme(id: string): void {
  const rest = importedThemes().filter((t) => t.id !== id);
  try {
    localStorage.setItem(importedKey, JSON.stringify(rest.map((t) => t.css)));
  } catch {
    // Nothing to remove.
  }
  if (read(activeKey) === id) applyTheme(defaultTheme);
}

/**
 * Tokens of a theme (its base included) as its ":root" rules set them, to draw its preview without
 * applying it.
 */
export function themeTokens(theme: Theme): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const t of chain(theme)) {
    for (const rule of Array.from(sheetOf(t).cssRules)) {
      if (!(rule instanceof CSSStyleRule) || !/^(:root|html)$/.test(rule.selectorText.trim())) continue;
      for (const name of Array.from(rule.style)) {
        if (name.startsWith("--")) tokens[name] = rule.style.getPropertyValue(name).trim();
      }
    }
  }
  return tokens;
}
