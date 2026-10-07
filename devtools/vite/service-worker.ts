import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Plugin, transformWithOxc } from "vite";

const source = join(import.meta.dirname, "..", "..", "src", "app", "sw.ts");

/**
 * Writes the service worker (src/app/sw.ts) into the build as /sw.js, a plain script that starts
 * with the build's description: an identifier that changes with any file of the build, so that
 * browsers install the new version, and the files kept on install. Those are the page, the scripts
 * and styles it loads, and the language catalogs: enough to show the first screen without the
 * server.
 */
export function serviceWorker(): Plugin {
  return {
    name: "laterna-service-worker",
    apply: "build",
    // After Vite has written index.html.
    enforce: "post",
    async generateBundle(_, bundle) {
      const files = Object.values(bundle);
      const page = bundle["index.html"];
      if (page?.type !== "asset") throw new Error("service worker: index.html is missing from the build");
      const html = page.source.toString();
      const shell = new Set(["/"]);
      for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) shell.add(m[1] ?? "");
      for (const f of files) {
        const catalog =
          f.type === "chunk" &&
          f.moduleIds.length > 0 &&
          f.moduleIds.every((id) => /\/src\/i18n\/(locales|server)\//.test(id));
        if (catalog) shell.add(`/${f.fileName}`);
      }

      const hash = createHash("sha256");
      for (const f of files.toSorted((a, b) => a.fileName.localeCompare(b.fileName))) {
        hash.update(f.fileName);
        hash.update(f.type === "chunk" ? f.code : f.source);
      }
      const build = { version: hash.digest("hex").slice(0, 16), shell: [...shell] };
      const { code } = await transformWithOxc(readFileSync(source, "utf8"), source, { lang: "ts" });
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        // A classic script: the module marker of the source has no place in it.
        source: `const build = ${JSON.stringify(build)};\n${code.replace(/^export \{\s*\};?$/m, "")}`,
      });
    },
  };
}
