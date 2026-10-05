import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { Plugin } from "vite";

/** Folders of pdfjs-dist that pdf.js loads itself, by URL: decoders, CMaps, fonts. */
const folders = ["wasm", "cmaps", "standard_fonts"];
const root = join(import.meta.dirname, "..", "..", "node_modules", "pdfjs-dist");
const types: Record<string, string> = {
  ".wasm": "application/wasm",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".js": "text/javascript",
};

/**
 * Serves under /pdfjs/ (in development) and copies as is into the build the files pdf.js fetches:
 * the JPEG 2000 decoder (scanned PDFs from the Internet Archive are full of it), JBIG2, CMaps of
 * Asian fonts, standard fonts.
 */
export function pdfjsAssets(): Plugin {
  return {
    name: "laterna-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const path = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
        const [folder, file] = path.replace(/^\//, "").split("/");
        if (!folder || !file || !folders.includes(folder) || file.includes("..")) return next();
        try {
          const body = readFileSync(join(root, folder, file));
          res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const folder of folders)
        for (const file of readdirSync(join(root, folder)))
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${folder}/${file}`,
            source: readFileSync(join(root, folder, file)),
          });
    },
  };
}
