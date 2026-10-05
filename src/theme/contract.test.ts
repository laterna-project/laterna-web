import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { builtInThemeIds, tokens } from "./contract";
import { parseManifest, themeProblems } from "./format";

const src = join(import.meta.dirname, "..");
const themeDir = join(import.meta.dirname, "themes");

/** Tokens defined by a theme file ("--name:"), media queries included. */
function definedTokens(css: string): Set<string> {
  return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? ""));
}

/** The app's CSS files, themes excluded. */
function stylesheets(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".css"))
    .map((f) => join(dir, f))
    .filter((f) => !f.startsWith(themeDir));
}

describe("theme contract", () => {
  it("each built-in theme has its file, in the format of imported themes", () => {
    const files = readdirSync(themeDir).filter((f) => f.endsWith(".css"));
    expect(files.sort()).toEqual(builtInThemeIds.map((id) => `${id}.css`).sort());
    for (const id of builtInThemeIds) {
      const css = readFileSync(join(themeDir, `${id}.css`), "utf8");
      const manifest = parseManifest(css);
      expect(typeof manifest === "string" ? manifest : manifest.id).toBe(id);
      expect(themeProblems(css)).toEqual([]);
    }
  });

  for (const id of builtInThemeIds) {
    it(`theme ${id} defines exactly the contract's tokens`, () => {
      const defined = definedTokens(readFileSync(join(themeDir, `${id}.css`), "utf8"));
      expect(
        [...tokens].filter((t) => !defined.has(t)),
        "missing tokens",
      ).toEqual([]);
      expect(
        [...defined].filter((t) => !(tokens as readonly string[]).includes(t)),
        "tokens outside the contract",
      ).toEqual([]);
    });
  }

  it("style sheets only use the contract's tokens", () => {
    const unknown: string[] = [];
    for (const file of stylesheets(src)) {
      const css = readFileSync(file, "utf8");
      for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!(tokens as readonly string[]).includes(m[1] ?? ""))
          unknown.push(`${relative(src, file)}: ${m[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("no color is hard-coded outside the themes", () => {
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i;
    const offenders = stylesheets(src).filter((f) => literal.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(src, f))).toEqual([]);
  });
});
