/**
 * Parameters of a play address: "?start=0" forces the start position (in seconds);
 * "?playlist=...&entry=..." plays an entry of a playlist, then continues with the next.
 */
export interface PlaySearch {
  start?: number;
  playlist?: string;
  entry?: string;
}

export function validatePlaySearch(search: Record<string, unknown>): PlaySearch {
  const n = Number(search.start);
  const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const out: PlaySearch = {};
  if (search.start !== undefined && Number.isFinite(n) && n >= 0) out.start = n;
  const playlist = text(search.playlist);
  const entry = text(search.entry);
  if (playlist && entry) {
    out.playlist = playlist;
    out.entry = entry;
  }
  return out;
}
