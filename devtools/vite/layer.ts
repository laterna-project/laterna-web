import type { Plugin } from "vite";

/**
 * Puts each style sheet of the app (shared base, component modules, fonts) in the CSS layer `name`
 * (docs/design/themes.md). The chosen theme is applied outside any layer: its rules win over the
 * components' whatever their specificity, so a theme can restyle everything. The themes themselves
 * are read as text (?raw) and do not go through here.
 */
export function cssLayer(name: string): Plugin {
  return {
    name: "laterna-css-layer",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".css")) return null;
      // @charset and @import must stay at the top of the style sheet, outside any layer.
      const head = /^(?:\s*@(?:charset|import)\b[^;]*;)*/.exec(code)?.[0] ?? "";
      return { code: `${head}\n@layer ${name} {\n${code.slice(head.length)}\n}\n`, map: null };
    },
  };
}
