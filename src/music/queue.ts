// Listening queue and ReplayGain, without a browser: the music player (MusicProvider) only keeps
// the state. Tested in queue.test.ts.
import type { ReplayGain, Track } from "../gen/laterna/v1/catalog_pb";
import i18n, { num } from "../i18n";

export type Repeat = "off" | "all" | "one";

export interface Queue {
  tracks: Track[];
  /** Current track; -1 for an empty queue. */
  index: number;
  /** Order before shuffling, to restore it; null when not shuffled. */
  original: Track[] | null;
  repeat: Repeat;
}

export const emptyQueue: Queue = { tracks: [], index: -1, original: null, repeat: "off" };

/** Fisher-Yates shuffle (random injectable for tests). */
export function shuffle<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** New queue: the given tracks, from one of them; shuffled, it starts at random. */
export function startQueue(
  tracks: readonly Track[],
  index = 0,
  options: { shuffled?: boolean; repeat?: Repeat; random?: () => number } = {},
): Queue {
  const repeat = options.repeat ?? "off";
  if (tracks.length === 0) return { ...emptyQueue, repeat };
  if (options.shuffled)
    return { tracks: shuffle(tracks, options.random), index: 0, original: [...tracks], repeat };
  return {
    tracks: [...tracks],
    index: Math.min(Math.max(0, index), tracks.length - 1),
    original: null,
    repeat,
  };
}

export function currentTrack(q: Queue): Track | undefined {
  return q.tracks[q.index];
}

/**
 * Next track. auto: the previous one just ended ("repeat track" plays it again); otherwise "next"
 * was asked for. ended: nothing after, the queue stops on its last track.
 */
export function advance(q: Queue, auto: boolean): { queue: Queue; ended: boolean } {
  if (q.index < 0) return { queue: q, ended: true };
  if (auto && q.repeat === "one") return { queue: q, ended: false };
  if (q.index + 1 < q.tracks.length) return { queue: { ...q, index: q.index + 1 }, ended: false };
  if (q.repeat !== "off") return { queue: { ...q, index: 0 }, ended: false };
  return { queue: q, ended: true };
}

/** Previous track: the first stays the first, except with "repeat all". */
export function back(q: Queue): Queue {
  if (q.index > 0) return { ...q, index: q.index - 1 };
  if (q.repeat === "all" && q.tracks.length > 0) return { ...q, index: q.tracks.length - 1 };
  return q;
}

/** Play next: right after the current track. */
export function playNext(q: Queue, tracks: readonly Track[]): Queue {
  if (q.index < 0) return startQueue(tracks, 0, { repeat: q.repeat });
  const at = q.index + 1;
  return {
    ...q,
    tracks: [...q.tracks.slice(0, at), ...tracks, ...q.tracks.slice(at)],
    original: q.original && [...q.original, ...tracks],
  };
}

/** Adds to the end of the queue. */
export function append(q: Queue, tracks: readonly Track[]): Queue {
  if (q.index < 0) return startQueue(tracks, 0, { repeat: q.repeat });
  return { ...q, tracks: [...q.tracks, ...tracks], original: q.original && [...q.original, ...tracks] };
}

/** Removes a track; removing the current track moves to the next (or to the previous at the end). */
export function removeAt(q: Queue, i: number): Queue {
  if (i < 0 || i >= q.tracks.length) return q;
  const removed = q.tracks[i];
  const tracks = q.tracks.filter((_, k) => k !== i);
  if (tracks.length === 0) return { ...emptyQueue, repeat: q.repeat };
  const index = i < q.index ? q.index - 1 : Math.min(q.index, tracks.length - 1);
  return { ...q, tracks, index, original: q.original?.filter((t) => t !== removed) ?? null };
}

export function jump(q: Queue, i: number): Queue {
  return i >= 0 && i < q.tracks.length ? { ...q, index: i } : q;
}

/**
 * Shuffle or unshuffle. Shuffling keeps the current track first and shuffles the others;
 * unshuffling restores the previous order, on the same track.
 */
export function toggleShuffle(q: Queue, random: () => number = Math.random): Queue {
  const current = currentTrack(q);
  if (!current) return q;
  if (q.original) {
    const index = q.original.indexOf(current);
    return { ...q, tracks: q.original, index: Math.max(0, index), original: null };
  }
  const others = q.tracks.filter((_, k) => k !== q.index);
  return { ...q, tracks: [current, ...shuffle(others, random)], index: 0, original: q.tracks };
}

export function nextRepeat(r: Repeat): Repeat {
  return r === "off" ? "all" : r === "all" ? "one" : "off";
}

// --- ReplayGain
// -----------------------------------------------------------------------------------

/** Profile setting: auto = the album when an album is played in order, the track otherwise. */
export type GainSetting = "auto" | "track" | "album" | "off";
export type GainMode = "track" | "album" | "off";

/** Mode applied to the queue: "album" for a single album played in order. */
export function gainModeFor(setting: GainSetting, q: Queue): GainMode {
  if (setting !== "auto") return setting;
  const album = q.tracks[0]?.albumId;
  const oneAlbum = q.original === null && album !== undefined && q.tracks.every((t) => t.albumId === album);
  return oneAlbum ? "album" : "track";
}

/**
 * Volume factor of a track (1 = unchanged): the ReplayGain correction of the mode (the track's when
 * the album's is missing, and the other way round), limited by the peak so as not to clip.
 */
export function gainFactor(rg: ReplayGain | undefined, mode: GainMode): number {
  if (!rg || mode === "off") return 1;
  const gain = mode === "album" ? (rg.albumGain ?? rg.trackGain) : (rg.trackGain ?? rg.albumGain);
  const peak = mode === "album" ? (rg.albumPeak ?? rg.trackPeak) : (rg.trackPeak ?? rg.albumPeak);
  if (gain === undefined) return 1;
  const factor = 10 ** (gain / 20);
  return peak && peak > 0 ? Math.min(factor, 1 / peak) : factor;
}

/** Correction in dB in the interface language: "+1.9 dB", "-3 dB", "0 dB". */
export function decibels(db: number): string {
  const r = Math.round(db * 10) / 10;
  if (r === 0) return "0 dB";
  return `${r > 0 ? "+" : "−"}${num(Math.abs(r))} dB`;
}

/** What ReplayGain does to the current track, in plain words (queue). */
export function describeGain(rg: ReplayGain | undefined, mode: GainMode): string {
  if (mode === "off") return i18n.t("music.gainOff");
  const gain = mode === "album" ? (rg?.albumGain ?? rg?.trackGain) : (rg?.trackGain ?? rg?.albumGain);
  if (gain === undefined) return i18n.t("music.gainMissing");
  const applied = 20 * Math.log10(gainFactor(rg, mode));
  const album = mode === "album";
  return applied < gain - 0.05
    ? i18n.t(album ? "music.gainOfAlbumLimited" : "music.gainOfTrackLimited", {
        gain: decibels(gain),
        applied: decibels(applied),
      })
    : i18n.t(album ? "music.gainOfAlbum" : "music.gainOfTrack", { gain: decibels(gain) });
}
