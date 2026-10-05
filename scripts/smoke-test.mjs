// Serves a built client the way the README tells people to (files, and index.html for any other
// path), then checks that the page and everything it references load. Used on the release
// archive, so that it is known to be complete before it is published.
//
//   node scripts/smoke-test.mjs <folder>
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.argv[2];
if (!root || !existsSync(join(root, "index.html"))) {
  console.error("Usage: node scripts/smoke-test.mjs <folder with index.html>");
  process.exit(1);
}

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  let file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html");
  }
  res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

const problems = [];
async function get(path) {
  const res = await fetch(base + path);
  if (!res.ok) problems.push(`${path}: HTTP ${res.status}`);
  return res;
}

const html = await (await get("/")).text();
if (!html.includes('<div id="app">')) problems.push("/: no app root in index.html");

// A route of the app is answered with the page too.
const deep = await (await get("/movies")).text();
if (deep !== html) problems.push("/movies: not answered with index.html");

// Scripts, style sheets and preloads referenced by the page, and what the entry script imports.
const assets = new Set([...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]));
for (const asset of assets) {
  const res = await get(asset);
  if (res.headers.get("content-type") === "text/html") problems.push(`${asset}: missing from the archive`);
  if (asset.endsWith(".js")) {
    const code = await res.text();
    for (const m of code.matchAll(/["'`](\.\/[\w.-]+\.(?:js|css))["'`]/g)) {
      const dep = new URL(m[1], base + asset).pathname;
      if (!assets.has(dep) && !existsSync(join(root, dep)))
        problems.push(`${dep}: imported by ${asset}, missing`);
    }
  }
}

server.close();
if (problems.length > 0) {
  console.error(`Smoke test failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`Smoke test passed: index.html, a route and ${assets.size} referenced files.`);
