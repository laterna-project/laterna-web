// Entries of a playlist: what is shown of them.
import { formatRuntime, ImageKind, pickImage, seconds } from "../../api/media";
import type { Image } from "../../gen/laterna/v1/catalog_pb";
import type { Playlist, PlaylistEntry } from "../../gen/laterna/v1/playlist_pb";
import i18n from "../../i18n";
import type { Universe } from "../../theme/contract";
import { episodeCode } from "../catalog/format";

export interface EntryView {
  title: string;
  sub: string;
  /** Kind, for the label (kinds.<kind>) and the image shape. */
  kind: "movie" | "episode" | "track";
  universe: Universe;
  runtime: number;
  image: Image | undefined;
}

export function entryView(e: PlaylistEntry): EntryView | null {
  switch (e.item.case) {
    case "movie": {
      const m = e.item.value;
      return {
        title: m.title,
        sub: m.year ? String(m.year) : "",
        kind: "movie",
        universe: "movies",
        runtime: seconds(m.runtime),
        image: pickImage(m.images, ImageKind.POSTER),
      };
    }
    case "episode": {
      const ep = e.item.value;
      return {
        title: ep.title,
        sub: `${ep.seriesTitle} · ${episodeCode(ep, true)}`,
        kind: "episode",
        universe: "series",
        runtime: seconds(ep.runtime),
        image: pickImage(ep.images, ImageKind.THUMB, ImageKind.BACKDROP),
      };
    }
    case "track": {
      const t = e.item.value;
      return {
        title: t.title,
        sub: [t.artists || t.artistName, t.albumTitle].filter(Boolean).join(" · "),
        kind: "track",
        universe: "music",
        runtime: seconds(t.runtime),
        image: pickImage(t.images, ImageKind.POSTER),
      };
    }
    default:
      return null;
  }
}

/** "7 entries · 4 h 36 min". */
export function playlistMeta(p: Playlist): string {
  const total = seconds(p.duration);
  return [i18n.t("lists.entries", { count: p.entryCount }), total > 0 ? formatRuntime(total) : ""]
    .filter(Boolean)
    .join(" · ");
}

/** Entries not yet in place: a playlist reordered locally, before the server answers. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  if (item !== undefined) out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

/** Next video of a playlist after an entry (tracks go to the music player). */
export function nextVideo(entries: readonly PlaylistEntry[], entryId: string): PlaylistEntry | undefined {
  const at = entries.findIndex((e) => e.id === entryId);
  if (at < 0) return undefined;
  return entries.slice(at + 1).find((e) => e.item.case === "movie" || e.item.case === "episode");
}
