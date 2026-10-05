// Format of a theme file (docs/themes.md): a plain CSS style sheet whose first comment is an
// "@laterna-theme" manifest (name, author, version, description, base theme). These functions do
// not depend on the browser: they serve the import and the tests.
import i18n from "../i18n";

/** What a theme's manifest says. */
export interface ThemeManifest {
  /** Identifier: the manifest's "id", otherwise derived from the name ("Pink Neon" -> "pink-neon"). */
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  /** Built-in theme whose tokens fill in the missing ones; absent for a built-in theme. */
  base: string | undefined;
}

/** Maximum size of a theme file, fonts and images included (in characters). */
export const maxThemeSize = 1_000_000;

/** "Pink Neon!" -> "pink-neon". */
export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Reads the manifest at the top of the file:
 *
 *     /* @laterna-theme
 *        name: Neon
 *        author: Sam
 *        version: 1.0
 *        description: Dark, pink neon.
 *        base: universe
 *     *\/
 *
 * Returns the manifest, or an error message to show.
 */
export function parseManifest(css: string): ThemeManifest | string {
  const head = /^\s*(?:@charset\s+"[^"]*";\s*)?\/\*\s*@laterna-theme\b([\s\S]*?)\*\//.exec(css);
  if (!head) {
    return i18n.t("themeFile.notATheme");
  }
  const fields = new Map<string, string>();
  for (const line of (head[1] ?? "").split(/\r?\n/)) {
    const m = /^\s*\*?\s*([a-z]+)\s*:\s*(.*?)\s*$/i.exec(line);
    if (m?.[1] && m[2]) fields.set(m[1].toLowerCase(), m[2]);
  }
  const name = fields.get("name");
  if (!name) return i18n.t("themeFile.noName");
  const id = slug(fields.get("id") ?? name);
  if (!id) return i18n.t("themeFile.badName");
  return {
    id,
    name: name.slice(0, 60),
    author: (fields.get("author") ?? "").slice(0, 60),
    version: (fields.get("version") ?? "").slice(0, 20),
    description: (fields.get("description") ?? "").slice(0, 200),
    base: fields.get("base")?.toLowerCase(),
  };
}

/** Content between the opening parenthesis at `start` and its closing one. */
function balanced(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(start + 1, i);
  }
  return text.slice(start + 1);
}

/**
 * Addresses in a CSS text that would fetch something elsewhere: every url(...), and every string in
 * an image-set(...), image(...) or cross-fade(...) that does not start with "data:". A theme embeds
 * its fonts and images; it must load nothing (otherwise a style sheet could send what is displayed
 * to another server).
 */
export function remoteUrls(css: string): string[] {
  const found: string[] = [];
  const keep = (url: string) => {
    const u = url.trim();
    if (!/^data:/i.test(u)) found.push(u || "(empty)");
  };
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))/gi)) {
    keep(m[1] ?? m[2] ?? m[3] ?? "");
  }
  for (const m of css.matchAll(/(?:-webkit-)?(?:image-set|image|cross-fade)\(/gi)) {
    const inner = balanced(css, (m.index ?? 0) + m[0].length - 1);
    for (const s of inner.matchAll(/"([^"]*)"|'([^']*)'/g)) keep(s[1] ?? s[2] ?? "");
  }
  return found;
}

/**
 * What prevents using a theme text, in plain words; empty if there is nothing wrong. Checked on the
 * file's text, then on the style sheet as the browser read it (escapes resolved).
 */
export function themeProblems(css: string): string[] {
  const problems: string[] = [];
  if (css.length > maxThemeSize) {
    problems.push(i18n.t("themeFile.tooBig", { size: Math.round(maxThemeSize / 1000) }));
  }
  if (/@import\b/i.test(css)) {
    problems.push(i18n.t("themeFile.noImport"));
  }
  const urls = remoteUrls(css);
  if (urls.length > 0) {
    const shown = urls.slice(0, 3).join(", ");
    problems.push(i18n.t("themeFile.remote", { urls: `${shown}${urls.length > 3 ? "..." : ""}` }));
  }
  return problems;
}
