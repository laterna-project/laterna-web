// Writes the licenses of the production dependencies (the code and fonts that can end up in the
// build) to a Markdown file, with each package's license and notice texts. Release archives ship
// it next to the app, as the licenses of those packages require.
//
//   node scripts/licenses.mjs <output file>
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/licenses.mjs <output file>");
  process.exit(1);
}

const listing = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  }),
);
const packages = Object.values(listing)
  .flat()
  .sort((a, b) => a.name.localeCompare(b.name));

const textFile = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

const lines = [
  "# Third-party licenses",
  "",
  "Laterna Web is released under the GNU General Public License, version 3 or later (LICENSE).",
  "It includes the following packages, under their own licenses.",
  "",
];
for (const p of packages) {
  lines.push(`## ${p.name} ${p.versions.join(", ")}`, "", `License: ${p.license}`);
  if (p.homepage) lines.push(`Homepage: ${p.homepage}`);
  lines.push("");
  const dir = p.paths[0];
  const texts = dir ? readdirSync(dir).filter((f) => textFile.test(f)) : [];
  if (texts.length === 0) lines.push("(No license file in the package.)", "");
  for (const f of texts.sort()) {
    lines.push("```text", readFileSync(join(dir, f), "utf8").trimEnd(), "```", "");
  }
}
writeFileSync(out, lines.join("\n"));
console.log(`${packages.length} packages written to ${out}.`);
