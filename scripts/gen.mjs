// Generates the API client (src/gen) from the server's contract and copies the server's English
// and French text catalogs (src/i18n/server), both taken from the server version pinned in
// package.json ("laternaServer"). The other languages of those catalogs are translated here.
//
//   node scripts/gen.mjs           regenerate
//   node scripts/gen.mjs --check   fail if src/gen or the catalogs differ from that version
//
// LATERNA_SOURCE=../laterna reads a local checkout of the server instead, to work against
// changes that are not released yet.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = join(import.meta.dirname, "..");
const { laternaServer: version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const local = process.env.LATERNA_SOURCE ? resolve(process.env.LATERNA_SOURCE) : undefined;
const repository = "https://github.com/laterna-project/laterna";
const check = process.argv.includes("--check");
const languages = ["en", "fr"];
const catalogs = join(root, "src", "i18n", "server");

const input = local ?? `${repository}.git#tag=${version}`;
const source = local ?? `${repository} ${version}`;

async function catalog(lang) {
  if (local) return readFileSync(join(local, "internal", "i18n", "locales", `${lang}.json`), "utf8");
  const url = `${repository.replace("github.com", "raw.githubusercontent.com")}/${version}/internal/i18n/locales/${lang}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function generate(output) {
  const args = ["generate", input, ...(output ? ["--output", output] : [])];
  execFileSync("buf", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
}

function files(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();
}

if (!check) {
  generate();
  for (const lang of languages) writeFileSync(join(catalogs, `${lang}.json`), await catalog(lang));
  console.log(`Generated from ${source}.`);
  process.exit(0);
}

const out = join(root, ".gencheck");
rmSync(out, { recursive: true, force: true });
generate(out);
const fresh = join(out, "src", "gen");
const generated = join(root, "src", "gen");
const want = files(fresh);
const have = files(generated);
const read = (dir, f) => readFileSync(join(dir, f), "utf8");
const problems = [
  ...want.filter((f) => !have.includes(f)).map((f) => `missing: src/gen/${f}`),
  ...have.filter((f) => !want.includes(f)).map((f) => `extra: src/gen/${f}`),
  ...want
    .filter((f) => have.includes(f) && read(fresh, f) !== read(generated, f))
    .map((f) => `differs: src/gen/${f}`),
];
rmSync(out, { recursive: true, force: true });
for (const lang of languages)
  if ((await catalog(lang)) !== read(catalogs, `${lang}.json`))
    problems.push(`differs: src/i18n/server/${lang}.json`);

if (problems.length > 0) {
  console.error(`Not generated from ${source} (run "pnpm gen"):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`src/gen and the server catalogs match ${source}.`);
