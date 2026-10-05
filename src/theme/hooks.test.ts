import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { hooks } from "./hooks";

const src = join(import.meta.dirname, "..");
const guide = readFileSync(join(src, "..", "docs", "themes.md"), "utf8");

/** Hooks set in the code, with the file each one appears in. */
function usedHooks(): { name: string; file: string }[] {
  return readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .flatMap((f) => {
      const code = readFileSync(join(src, f), "utf8");
      return [...code.matchAll(/data-ui(=\{|="([^"]*)")/g)].map((m) => ({
        name: m[2] ?? "(computed value)",
        file: relative(src, join(src, f)),
      }));
    });
}

describe("theme hooks", () => {
  const used = usedHooks();

  it("the code sets none outside the list, always as a literal", () => {
    expect(used.filter((h) => !(h.name in hooks)).map((h) => `${h.file}: ${h.name}`)).toEqual([]);
  });

  it("each hook of the list is set somewhere", () => {
    const names = new Set(used.map((h) => h.name));
    expect(Object.keys(hooks).filter((h) => !names.has(h))).toEqual([]);
  });

  it("the authors' guide lists them all", () => {
    expect(Object.keys(hooks).filter((h) => !guide.includes(`\`${h}\``))).toEqual([]);
  });
});
