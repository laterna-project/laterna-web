// Notes of a release, laid out like the server's (GoReleaser there): the commit subjects since the
// previous release, grouped by their gitmoji, then how to install. The release workflow puts them
// on the release; the summary and the upgrade notes are written on top by hand
// (docs/releasing.md). Node runs it as it is (it strips the types itself).
//
//   node scripts/release-notes.ts <tag or commit>
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = "https://github.com/laterna-project/laterna-web";

// The groups of the server's .goreleaser.yaml, in its order; anything else is "Other changes".
const groups = [
  { title: "Features", emoji: ["✨"] },
  { title: "Fixes", emoji: ["🐛", "🩹", "🚑"] },
  { title: "Security", emoji: ["🔒"] },
  { title: "Performance", emoji: ["⚡"] },
];
// Left out, as on the server: CI, tests, development tools, release commits and merges.
const skipped = ["👷", "✅", "🔨", "🔖", "🔀"];

/**
 * The notes, in Markdown. commits: since the previous release, oldest first; ref: the tag (or the
 * commit) released; previous: the tag of the previous release, if there is one.
 */
export function releaseNotes(
  commits: { sha: string; subject: string }[],
  ref: string,
  previous: string | undefined,
): string {
  const sections = new Map<string, string[]>(
    [...groups.map((g) => g.title), "Other changes"].map((t) => [t, []]),
  );
  for (const { sha, subject } of commits) {
    if (subject.startsWith("Merge ") || skipped.some((e) => subject.startsWith(e))) continue;
    const group = groups.find((g) => g.emoji.some((e) => subject.startsWith(e)));
    sections.get(group?.title ?? "Other changes")?.push(`- ${subject} (${sha})`);
  }
  const lines = [];
  for (const [title, items] of sections) if (items.length > 0) lines.push(`## ${title}`, "", ...items, "");
  lines.push(
    "## Installing",
    "",
    `See the [README](${repository}/blob/${ref}/README.md#installing). \`checksums.txt\` lists the SHA-256 of the archives, and each archive carries a build provenance attestation (\`gh attestation verify <file> --repo laterna-project/laterna-web\`).`,
    "",
  );
  if (previous) lines.push(`**Full changelog**: ${repository}/compare/${previous}...${ref}`, "");
  return lines.join("\n");
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ref = process.argv[2];
  if (!ref) {
    console.error("Usage: node scripts/release-notes.ts <tag or commit>");
    process.exit(1);
  }
  // The latest release before this one; release candidates do not count.
  let previous: string | undefined;
  try {
    previous = git("describe", "--tags", "--abbrev=0", "--match", "v*", "--exclude", "*-*", `${ref}^`);
  } catch {
    // The first release: every commit.
  }
  const log = git(
    "log",
    "--no-merges",
    "--reverse",
    "--format=%h%x09%s",
    previous ? `${previous}..${ref}` : ref,
  );
  const commits = log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha = "", ...subject] = line.split("\t");
      return { sha, subject: subject.join("\t") };
    });
  process.stdout.write(releaseNotes(commits, ref, previous));
}
