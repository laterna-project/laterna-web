// Choosing the albums of a requested artist (server: docs/design/requests.md). Lidarr only knows
// the albums of an artist it has: the choice comes once the request is approved, from the list
// Lidarr gives then.
import type { RequestAlbum } from "../../gen/laterna/v1/request_pb";
import i18n from "../../i18n";

/** Lidarr's names for the kinds of releases, with ours. A name we do not know is shown as it is. */
const kindKeys = {
  album: "requests.albumKinds.album",
  ep: "requests.albumKinds.ep",
  single: "requests.albumKinds.single",
  broadcast: "requests.albumKinds.broadcast",
  other: "requests.albumKinds.other",
  studio: "requests.albumKinds.studio",
  live: "requests.albumKinds.live",
  compilation: "requests.albumKinds.compilation",
  soundtrack: "requests.albumKinds.soundtrack",
  remix: "requests.albumKinds.remix",
  demo: "requests.albumKinds.demo",
} as const;

/** A kind of release in the interface language: "EP", "Bande originale". */
export function kindName(name: string): string {
  const key = kindKeys[name.toLowerCase() as keyof typeof kindKeys];
  return key ? i18n.t(key) : name;
}

type Kinded = Pick<RequestAlbum, "type" | "secondaryTypes">;

/**
 * What an album is filed under: its secondary type when it has one (a live album is "Live", not
 * "Album"), else its primary type. Lidarr's own name, to compare; kindName translates it.
 */
export function albumKind(a: Kinded): string {
  return a.secondaryTypes[0] || a.type || "Other";
}

/** "EP", "Album · Live": what an album is, in words. A plain studio album says nothing. */
export function albumKindLabel(a: Kinded): string {
  const plain = a.type === "Album" && a.secondaryTypes.length === 0;
  return plain ? "" : [a.type, ...a.secondaryTypes].filter(Boolean).map(kindName).join(" · ");
}

/** The kinds a list of albums holds, studio albums first, with how many of each. */
export function albumKinds(albums: readonly Kinded[]): { kind: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of albums) counts.set(albumKind(a), (counts.get(albumKind(a)) ?? 0) + 1);
  const order = ["Album", "EP", "Single"];
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind));
}

/** The kinds a metadata profile of Lidarr keeps, in words: "Album, EP · Studio, Live". */
export function profileKinds(p: {
  primaryTypes: readonly string[];
  secondaryTypes: readonly string[];
}): string {
  const list = (names: readonly string[]) => names.map(kindName).join(", ");
  return [list(p.primaryTypes), list(p.secondaryTypes)].filter(Boolean).join(" · ");
}
