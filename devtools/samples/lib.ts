// Shared tools for building the free sample libraries (docs/design/sample-media.md): folders,
// verified downloads, archives, FFmpeg.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Root of the sample libraries (outside the repository); LATERNA_SAMPLES for another one. */
export const root = process.env.LATERNA_SAMPLES ?? join(homedir(), "laterna-samples");
/** Files downloaded as is, kept to rebuild without downloading again. */
export const cacheDir = join(root, ".sources");
/** Hashes of the sources, committed: a file changed at the source is refused. */
const lockPath = join(import.meta.dirname, "sources.lock.json");

export const userAgent = "laterna-web-dev/0.1 (+https://github.com/laterna-project/laterna-web)";

interface LockEntry {
  url: string;
  size: number;
  sha256: string;
}
interface Lock {
  sources: Record<string, LockEntry>;
  selections: Record<string, string[]>;
}

const lock: Lock = existsSync(lockPath)
  ? (JSON.parse(readFileSync(lockPath, "utf8")) as Lock)
  : { sources: {}, selections: {} };

export function saveLock(): void {
  const sorted = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    lockPath,
    `${JSON.stringify({ sources: sorted(lock.sources), selections: sorted(lock.selections) }, null, 2)}\n`,
  );
}

/** Choice made on the first run (photos, comic pages...), reused afterwards to stay stable. */
export async function selection(key: string, choose: () => Promise<string[]>): Promise<string[]> {
  const known = lock.selections[key];
  if (known) return known;
  const chosen = await choose();
  lock.selections[key] = chosen;
  saveLock();
  return chosen;
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeText(path: string, text: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

export function log(message: string): void {
  console.log(message);
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

/** Last download started to each site. */
const lastFetch = new Map<string, number>();

/** At least one second between two downloads from the same site (Wikimedia limits the rate). */
async function politeness(url: string): Promise<void> {
  const host = new URL(url).host;
  const wait = (lastFetch.get(host) ?? 0) + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch.set(host, Date.now());
}

/**
 * Downloads a source into the cache under the given name (once), resumes an interrupted download,
 * checks the known hash or records it on the first run. Returns the local path.
 */
export async function download(name: string, url: string): Promise<string> {
  const target = join(cacheDir, name);
  ensureDir(dirname(target));
  const known = lock.sources[name];
  if (existsSync(target)) {
    if (known && statSync(target).size !== known.size)
      throw new Error(`${name}: size differs from the recorded source`);
    if (!known) {
      lock.sources[name] = { url, size: statSync(target).size, sha256: await sha256Of(target) };
      saveLock();
    }
    return target;
  }
  const part = `${target}.part`;
  await politeness(url);
  for (let attempt = 1; ; attempt++) {
    let wait = 2000 * attempt;
    try {
      const have = existsSync(part) ? statSync(part).size : 0;
      const res = await fetch(url, {
        headers: { "User-Agent": userAgent, ...(have > 0 ? { Range: `bytes=${have}-` } : {}) },
        redirect: "follow",
      });
      if (res.status === 429 || res.status === 503) {
        // Rate limited: wait as long as the site asks, otherwise longer and longer.
        wait = Math.max(Number(res.headers.get("retry-after") ?? 0) * 1000, 15_000 * attempt);
      }
      if (!res.ok || !res.body) throw new Error(`${name}: HTTP ${res.status}`);
      const resumed = res.status === 206;
      const total = Number(res.headers.get("content-length") ?? 0) + (resumed ? have : 0);
      const out = createWriteStream(part, { flags: resumed ? "a" : "w" });
      let done = resumed ? have : 0;
      let shown = 0;
      for await (const chunk of res.body) {
        if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
        done += chunk.length;
        if (total > 50e6 && done - shown > total / 10) {
          shown = done;
          log(`    ${name}: ${Math.round((done / total) * 100)}% of ${formatSize(total)}`);
        }
      }
      await new Promise<void>((resolve, reject) =>
        out.end((err?: Error | null) => (err ? reject(err) : resolve())),
      );
      break;
    } catch (err) {
      if (attempt >= 8) throw err;
      log(`    ${name}: retrying in ${Math.round(wait / 1000)} s (${(err as Error).message})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  const sha256 = await sha256Of(part);
  if (known && known.sha256 !== sha256) throw new Error(`${name}: hash differs from the recorded source`);
  renameSync(part, target);
  lock.sources[name] = { url, size: statSync(target).size, sha256 };
  saveLock();
  log(`  downloaded: ${name} (${formatSize(statSync(target).size)})`);
  return target;
}

/** Windows tar (bsdtar) reads and writes ZIP files; elsewhere, bsdtar must be installed. */
const tar =
  process.platform === "win32"
    ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
    : "bsdtar";

/** Extracts a ZIP or TAR archive into a folder. */
export function extract(archive: string, into: string): void {
  ensureDir(into);
  execFileSync(tar, ["-xf", archive, "-C", into], { stdio: "inherit" });
}

/** Writes a ZIP archive (CBZ) with the content of a folder, in name order. */
export function zipDir(dir: string, files: string[], out: string): void {
  ensureDir(dirname(out));
  execFileSync(tar, ["--format", "zip", "-cf", out, "-C", dir, ...files], { stdio: "inherit" });
}

/** Runs FFmpeg (arguments as an array, never through a shell). */
export function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

/** Duration of a media file in seconds. */
export function duration(path: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    {
      encoding: "utf8",
    },
  );
  return Number.parseFloat(out.trim());
}

/** Poster (2:3) and backdrop (16:9) taken from frames of the movie: no image to download. */
export function artwork(video: string, dir: string, prefix = ""): void {
  const d = duration(video);
  const poster = join(dir, `${prefix}poster.jpg`);
  const fanart = join(dir, `${prefix}fanart.jpg`);
  if (!existsSync(poster))
    ffmpeg([
      "-ss",
      String(d * 0.22),
      "-i",
      video,
      "-frames:v",
      "1",
      "-vf",
      "crop=ih*2/3:ih,scale=600:-2",
      "-q:v",
      "3",
      poster,
    ]);
  if (!existsSync(fanart))
    ffmpeg([
      "-ss",
      String(d * 0.38),
      "-i",
      video,
      "-frames:v",
      "1",
      "-vf",
      "scale=1280:-2",
      "-q:v",
      "3",
      fanart,
    ]);
}

/** Thumbnail of an episode ("<file>-thumb.jpg"). */
export function thumb(video: string, out: string): void {
  if (existsSync(out)) return;
  ffmpeg([
    "-ss",
    String(duration(video) * 0.3),
    "-i",
    video,
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-2",
    "-q:v",
    "3",
    out,
  ]);
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A work used, for ATTRIBUTIONS.md. */
export interface Credit {
  library: string;
  work: string;
  author: string;
  license: string;
  licenseUrl?: string;
  source: string;
  changes?: string;
}
