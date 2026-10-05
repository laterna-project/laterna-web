// Prepares a development Laterna server with the free sample libraries
// (docs/design/sample-media.md): setup (administrator account), profiles and a test account,
// libraries, scan. Only goes through the API, with the generated client. Running it again creates
// nothing twice.
//
//   pnpm seed               server at http://localhost:8096 (LATERNA_URL for another one)
//
// The test credentials are generated at setup and kept in .dev/seed.json (not committed): read them
// there to sign in to the app.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { create } from "@bufbuild/protobuf";
import { type Client, createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AccountService } from "../../src/gen/laterna/v1/account_pb";
import { AuthService, DeviceSchema } from "../../src/gen/laterna/v1/auth_pb";
import { EventService } from "../../src/gen/laterna/v1/events_pb";
import { LibraryKind, LibraryService } from "../../src/gen/laterna/v1/library_pb";
import { ProfileService } from "../../src/gen/laterna/v1/profile_pb";
import { ServerService } from "../../src/gen/laterna/v1/server_pb";
import { log, root } from "./lib.ts";

const baseUrl = process.env.LATERNA_URL ?? "http://localhost:8096";
const credsPath = join(import.meta.dirname, "..", "..", ".dev", "seed.json");

interface Creds {
  server: string;
  admin: { username: string; password: string };
  user: { username: string; password: string };
}

const device = create(DeviceSchema, {
  name: "Seed",
  client: "laterna-web devtools",
  clientVersion: "0.1",
  platform: process.platform,
});

let token = "";
const bearer: Interceptor = (next) => (req) => {
  if (token) req.header.set("Authorization", `Bearer ${token}`);
  return next(req);
};
const transport = createConnectTransport({ baseUrl, interceptors: [bearer] });
const client = <S extends Parameters<typeof createClient>[0]>(service: S): Client<S> =>
  createClient(service, transport);

const password = () => randomBytes(12).toString("base64url");

const libraries: { name: string; kind: LibraryKind; dir: string }[] = [
  { name: "Movies", kind: LibraryKind.MOVIES, dir: "movies" },
  { name: "Shows", kind: LibraryKind.SHOWS, dir: "shows" },
  { name: "Anime", kind: LibraryKind.SHOWS, dir: "anime" },
  { name: "Music", kind: LibraryKind.MUSIC, dir: "music" },
  { name: "Books", kind: LibraryKind.BOOKS, dir: "books" },
  { name: "Photos", kind: LibraryKind.PHOTOS, dir: "photos" },
];

async function signIn(): Promise<Creds> {
  const auth = client(AuthService);
  const info = await client(ServerService).getServerInfo({});
  if (info.setupRequired) {
    const creds: Creds = {
      server: baseUrl,
      admin: { username: "admin", password: password() },
      user: { username: "sam", password: password() },
    };
    const res = await auth.setup({ ...creds.admin, device });
    token = res.token;
    mkdirSync(join(credsPath, ".."), { recursive: true });
    writeFileSync(credsPath, `${JSON.stringify(creds, null, 2)}\n`);
    log(`Server set up: administrator account "${creds.admin.username}" (credentials in .dev/seed.json)`);
    return creds;
  }
  if (!existsSync(credsPath)) {
    throw new Error(
      "server already set up without .dev/seed.json: start from a new server (delete the server's .dev folder) or write this file",
    );
  }
  const creds = JSON.parse(readFileSync(credsPath, "utf8")) as Creds;
  token = (await auth.login({ ...creds.admin, device })).token;
  log(`Signed in as "${creds.admin.username}"`);
  return creds;
}

async function profiles(): Promise<void> {
  const svc = client(ProfileService);
  let list = (await svc.listProfiles({})).profiles;
  const session = (await client(AuthService).getSession({})).session;
  if (!session?.profile) {
    const main = list.find((p) => !p.kid && !p.hasPin) ?? list[0];
    if (!main) throw new Error("no profile on the administrator account");
    await svc.selectProfile({ profileId: main.id });
  }
  if (!list.some((p) => p.name === "Maya")) {
    await svc.createProfile({ name: "Maya", kid: true });
    list = (await svc.listProfiles({})).profiles;
    log('Kid profile "Maya" created (up to 10 years old)');
  }
}

async function accounts(creds: Creds): Promise<void> {
  const svc = client(AccountService);
  const existing = (await svc.listAccounts({})).accounts;
  if (!existing.some((a) => a.account?.username === creds.user.username)) {
    await svc.createAccount({ ...creds.user, isAdmin: false });
    log(`Account "${creds.user.username}" created (all libraries)`);
  }
}

async function librariesAndScan(): Promise<void> {
  const svc = client(LibraryService);
  const known = (await svc.listLibraries({})).libraries.map((l) => l.library);
  const ids: string[] = [];
  for (const l of libraries) {
    const path = join(root, l.dir);
    if (!existsSync(path)) {
      log(`  ${l.name}: ${path} missing (pnpm samples ${l.dir}), library skipped`);
      continue;
    }
    const found = known.find((k) => k?.name === l.name);
    if (found) {
      ids.push(found.id);
      continue;
    }
    const res = await svc.createLibrary({ name: l.name, kind: l.kind, paths: [path], language: "en-US" });
    if (res.library) ids.push(res.library.id);
    log(`Library "${l.name}" created: ${path}`);
  }

  // Scan of each library, awaited through the event stream (LibraryScanned).
  const events = client(EventService);
  const abort = new AbortController();
  const pending = new Set(ids);
  const done = (async () => {
    for await (const res of events.subscribe({}, { signal: abort.signal })) {
      if (res.event?.kind.case === "libraryScanned") {
        const s = res.event.kind.value;
        if (pending.delete(s.libraryId)) log(`  scan finished: ${s.files} files, ${s.added} added`);
        if (pending.size === 0) return;
      }
    }
  })().catch((err: unknown) => {
    if (!abort.signal.aborted) throw err;
  });
  for (const id of ids) await svc.scanLibrary({ libraryId: id });
  const timeout = setTimeout(() => abort.abort(), 10 * 60_000);
  await done;
  clearTimeout(timeout);
  abort.abort();

  for (const s of (await svc.listLibraries({})).libraries) {
    const c = s.counts;
    const parts = c
      ? Object.entries({
          movies: c.movies,
          series: c.series,
          episodes: c.episodes,
          artists: c.artists,
          albums: c.albums,
          tracks: c.tracks,
          "book series": c.bookSeries,
          books: c.books,
          "photo albums": c.photoAlbums,
          photos: c.photos,
        })
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n} ${k}`)
      : [];
    log(`  ${s.library?.name}: ${parts.join(", ") || "nothing yet (analysis in progress)"}`);
  }
  log("File analysis goes on on the server (durations, tracks, subtitles, thumbnails).");
}

const creds = await signIn();
await profiles();
await accounts(creds);
await librariesAndScan();
