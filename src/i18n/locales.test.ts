import { describe, expect, it } from "vitest";
import { euLanguages } from "./index";
import en from "./locales/en.json";

type Tree = { [key: string]: string | Tree };

const files = import.meta.glob<Tree>("./locales/*.json", { import: "default", eager: true });
const catalogs = new Map(
  Object.entries(files).map(([path, tree]) => [path.replace(/^.*\/(\w+)\.json$/, "$1"), tree]),
);

/** Flat keys ("player.skipIntro") and their text. */
function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}

const plurals = /_(zero|one|two|few|many|other)$/;
const base = (key: string) => key.replace(plurals, "");
const variables = (text: string) =>
  [...new Set([...text.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1] ?? ""))].sort().join();
// <Trans> tags; "<token>" in an example is not one.
const tags = (text: string) =>
  [...text.matchAll(/<\/?(strong|link|code)>/g)]
    .map((m) => m[0])
    .sort()
    .join();

const reference = leaves(en as Tree);
const pluralBases = new Set([...reference.keys()].filter((k) => plurals.test(k)).map(base));
const plain = [...reference.keys()].filter((k) => !plurals.test(k));

describe("translation catalogs", () => {
  it("each belongs to a language of the European Union", () => {
    expect([...catalogs.keys()].filter((id) => !euLanguages.some((l) => l.id === id))).toEqual([]);
  });

  for (const [lang, tree] of catalogs) {
    if (lang === "en") continue;
    const m = leaves(tree);
    describe(lang, () => {
      it("has the texts of English, no more, no less", () => {
        const keys = [...m.keys()];
        expect(
          plain.filter((k) => !m.has(k)),
          "missing",
        ).toEqual([]);
        expect(
          keys.filter((k) => (plurals.test(k) ? !pluralBases.has(base(k)) : !reference.has(k))),
          "extra",
        ).toEqual([]);
      });

      it("uses the variables and tags of English", () => {
        const wrong: string[] = [];
        for (const [k, v] of m) {
          const ref = reference.get(k) ?? reference.get(`${base(k)}_other`) ?? "";
          // A plural form may spell the number out ("one"): count is optional.
          const strip = (s: string) => s.replace(/(^|,)count(?=,|$)/, "");
          if (strip(variables(v)) !== strip(variables(ref))) wrong.push(`${k}: variables`);
          if (tags(v) !== tags(ref)) wrong.push(`${k}: tags`);
        }
        expect(wrong).toEqual([]);
      });

      it("gives every plural form of the language", () => {
        // Forms required by Intl.PluralRules ("few" in Polish, "two" in Slovenian...).
        const need = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
        const missing = [...pluralBases].flatMap((b) =>
          need.filter((p) => !m.has(`${b}_${p}`)).map((p) => `${b}_${p}`),
        );
        expect(missing).toEqual([]);
      });

      it("has no empty text", () => {
        expect([...m].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
      });
    });
  }
});

// Server texts (server: docs/design/i18n.md): flat, in its syntax. English and French come from its
// repository (checked by "pnpm gen:check"), the other languages are translated here.
const serverFiles = import.meta.glob<Record<string, string>>("./server/*.json", {
  import: "default",
  eager: true,
});
const serverCatalogs = new Map(
  Object.entries(serverFiles).map(([path, flat]) => [path.replace(/^.*\/(\w+)\.json$/, "$1"), flat]),
);
const placeholders = (text: string) =>
  [...text.matchAll(/\{[a-z0-9_]+(?::[a-z]+)?\}/g)]
    .map((m) => m[0])
    .sort()
    .join();

describe("server text catalogs", () => {
  const reference = serverCatalogs.get("en") ?? {};

  it("one per interface language", () => {
    expect([...catalogs.keys()].filter((id) => !serverCatalogs.has(id))).toEqual([]);
  });

  for (const [lang, flat] of serverCatalogs) {
    if (lang === "en") continue;
    it(`${lang}: the keys and parameters of English, no empty text`, () => {
      expect(Object.keys(flat).sort()).toEqual(Object.keys(reference).sort());
      const wrong = Object.entries(flat).filter(
        ([k, v]) => !v.trim() || placeholders(v) !== placeholders(reference[k] ?? ""),
      );
      expect(wrong.map(([k]) => k)).toEqual([]);
    });
  }
});
