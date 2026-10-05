// Simulates some use of the administrator account's main profile (docs/design/sample-media.md): two
// movies started, episodes watched, books in progress, an album played, a hand-made collection and
// a playlist. Enough for the "Resume", "Next up", "Continue reading" and "Recently played" home
// rows. Goes through the API like a client; running it again creates neither the collection nor the
// playlist twice.
//
//   pnpm seed:activity       after pnpm seed; LATERNA_URL for another server
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { create } from "@bufbuild/protobuf";
import { DurationSchema } from "@bufbuild/protobuf/wkt";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "../../src/gen/laterna/v1/auth_pb";
import { BookService } from "../../src/gen/laterna/v1/book_pb";
import { CatalogService } from "../../src/gen/laterna/v1/catalog_pb";
import { CollectionService } from "../../src/gen/laterna/v1/collection_pb";
import { MusicService } from "../../src/gen/laterna/v1/music_pb";
import {
  DeviceProfileSchema,
  PlaybackService,
  VideoSupportSchema,
} from "../../src/gen/laterna/v1/playback_pb";
import { PlaylistService } from "../../src/gen/laterna/v1/playlist_pb";
import { ProfileService } from "../../src/gen/laterna/v1/profile_pb";
import { log } from "./lib.ts";

const baseUrl = process.env.LATERNA_URL ?? "http://localhost:8096";
const creds = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", ".dev", "seed.json"), "utf8"));

let token = "";
const bearer: Interceptor = (next) => (req) => {
  if (token) req.header.set("Authorization", `Bearer ${token}`);
  return next(req);
};
const transport = createConnectTransport({ baseUrl, interceptors: [bearer] });
const auth = createClient(AuthService, transport);
const profiles = createClient(ProfileService, transport);
const catalog = createClient(CatalogService, transport);
const playback = createClient(PlaybackService, transport);
const books = createClient(BookService, transport);
const music = createClient(MusicService, transport);
const collections = createClient(CollectionService, transport);
const playlists = createClient(PlaylistService, transport);

token = (await auth.login({ ...creds.admin })).token;
const main = (await profiles.listProfiles({})).profiles.find((p) => p.name === creds.admin.username);
if (!main) throw new Error(`profile "${creds.admin.username}" not found`);
await profiles.selectProfile({ profileId: main.id });
log(`Profile "${main.name}"`);

// A device that plays everything directly: opening a playback starts no transcoding.
const device = create(DeviceProfileSchema, {
  containers: ["mp4", "mkv", "webm", "mov", "matroska"],
  video: ["h264", "hevc", "vp8", "vp9", "av1"].map((codec) =>
    create(VideoSupportSchema, { codec, maxBitDepth: 10 }),
  ),
  audioCodecs: ["aac", "mp3", "opus", "vorbis", "flac", "ac3"],
  hls: false,
  subtitleFormats: ["vtt", "ass"],
});
const seconds = (s: number) => create(DurationSchema, { seconds: BigInt(Math.round(s)) });

async function find(query: string, kind: "movie" | "series" | "book" | "episode" | "album") {
  const found = (await catalog.search({ query, limit: 10 })).results.find((r) => r.item.case === kind);
  if (!found) throw new Error(`"${query}" not found (is the analysis finished?)`);
  return found.item.value as { id: string; title: string };
}

/** Playback opened, then stopped at a fraction of the duration: a resume position is saved. */
async function watch(query: string, fraction: number): Promise<void> {
  const movie = await find(query, "movie");
  const start = await playback.startPlayback({ itemId: movie.id, device });
  const total = Number(start.duration?.seconds ?? 0n);
  await playback.reportProgress({ sessionId: start.sessionId, position: seconds(total * fraction) });
  await playback.stopPlayback({ sessionId: start.sessionId, position: seconds(total * fraction) });
  log(`  ${movie.title}: started, stopped at ${Math.round(fraction * 100)}%`);
}

await watch("Tears of Steel", 0.43);
await watch("Cosmos Laundromat", 0.21);

for (const [query, count] of [
  ["Caminandes", 1],
  ["Les Vampires", 1],
] as const) {
  const series = await find(query, "series");
  const episodes = (await catalog.listEpisodes({ seriesId: series.id })).episodes;
  for (const e of episodes.slice(0, count)) await catalog.setPlayed({ itemId: e.id, played: true });
  log(`  ${series.title}: ${count} episode watched`);
}

for (const [query, progression, page] of [
  ["Fantine", 0.02, 0],
  ["Les Potions arc-en-ciel", 0.45, 4],
] as const) {
  const book = await find(query, "book");
  await books.saveReadingProgress({ bookId: book.id, progression, page });
  log(`  ${book.title}: ${Math.round(progression * 100)}%`);
}

const album = (await music.listAlbums({ pageSize: 50 })).albums.find((a) => a.title === "Funk Sampler");
if (album) {
  const tracks = (await music.getAlbum({ albumId: album.id })).tracks;
  const first = tracks[0];
  if (first) {
    const start = await playback.startPlayback({ itemId: first.id, device });
    const total = Number(start.duration?.seconds ?? 0n);
    await playback.stopPlayback({ sessionId: start.sessionId, position: seconds(total) });
    log(`  ${album.title}: one track played`);
  }
}
// A hand-made collection (next to the sagas taken from NFO files) and a mixed playlist.
const silent = "Silent films";
if (!(await collections.listCollections({})).collections.some((c) => c.name === silent)) {
  const ids = [];
  for (const q of ["Nosferatu", "A Trip to the Moon", "The Arrival of a Train"])
    ids.push((await find(q, "movie")).id);
  await collections.createCollection({
    name: silent,
    overview: "The silent films of the library, from the first short films to feature films.",
    itemIds: ids,
  });
  log(`  collection "${silent}"`);
}
const sunday = "Sunday";
if (!(await playlists.listPlaylists({})).playlists.some((p) => p.name === sunday)) {
  const ids = [(await find("Llama Drama", "episode")).id, (await find("Sintel", "movie")).id];
  ids.push((await find("Nocturnes", "album")).id);
  await playlists.createPlaylist({ name: sunday, itemIds: ids });
  log(`  playlist "${sunday}"`);
}
log("Done.");
