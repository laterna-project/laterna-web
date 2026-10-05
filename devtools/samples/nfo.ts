// Metadata written next to the media, in the formats the server reads (server:
// docs/design/metadata.md and media-types.md): Kodi NFO, ComicInfo.xml, Calibre metadata.opf.
import { escapeXml as x } from "./lib.ts";

type Fields = Record<string, string | number | string[] | undefined>;

function tags(fields: Fields): string {
  return Object.entries(fields)
    .flatMap(([k, v]) =>
      v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((one) => `  <${k}>${x(String(one))}</${k}>`),
    )
    .join("\n");
}

function doc(root: string, fields: Fields, extra = ""): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${root}>\n${tags(fields)}${extra}\n</${root}>\n`;
}

export interface MovieInfo {
  title: string;
  originaltitle?: string;
  year: number;
  premiered?: string;
  plot: string;
  tagline?: string;
  runtime?: number;
  genres: string[];
  mpaa: string;
  directors: string[];
  credits?: string[];
  studios?: string[];
  country?: string;
  set?: { name: string; overview: string };
}

export function movieNfo(m: MovieInfo): string {
  const set = m.set
    ? `\n  <set>\n    <name>${x(m.set.name)}</name>\n    <overview>${x(m.set.overview)}</overview>\n  </set>`
    : "";
  return doc(
    "movie",
    {
      title: m.title,
      originaltitle: m.originaltitle,
      year: m.year,
      premiered: m.premiered,
      plot: m.plot,
      tagline: m.tagline,
      runtime: m.runtime,
      genre: m.genres,
      mpaa: m.mpaa,
      director: m.directors,
      credits: m.credits,
      studio: m.studios,
      country: m.country,
    },
    set,
  );
}

export interface ShowInfo {
  title: string;
  originaltitle?: string;
  year: number;
  premiered?: string;
  plot: string;
  genres: string[];
  mpaa: string;
  studios?: string[];
}

export function tvshowNfo(s: ShowInfo): string {
  return doc("tvshow", {
    title: s.title,
    originaltitle: s.originaltitle,
    year: s.year,
    premiered: s.premiered,
    plot: s.plot,
    genre: s.genres,
    mpaa: s.mpaa,
    studio: s.studios,
  });
}

export interface EpisodeInfo {
  title: string;
  season: number;
  episode: number;
  aired?: string;
  plot: string;
  directors?: string[];
}

export function episodeNfo(e: EpisodeInfo): string {
  return doc("episodedetails", {
    title: e.title,
    season: e.season,
    episode: e.episode,
    aired: e.aired,
    plot: e.plot,
    director: e.directors,
  });
}

export function albumNfo(a: {
  title: string;
  artist: string;
  year?: number;
  genres: string[];
  review: string;
}): string {
  return doc("album", { title: a.title, artist: a.artist, year: a.year, genre: a.genres, review: a.review });
}

export function artistNfo(a: { name: string; biography: string; genres: string[] }): string {
  return doc("artist", { name: a.name, biography: a.biography, genre: a.genres });
}

export interface ComicInfo {
  series: string;
  number: number;
  title: string;
  summary: string;
  year: number;
  writer: string;
  penciller: string;
  language: string;
  manga?: "YesAndRightToLeft" | "No";
  pageCount: number;
}

export function comicInfo(c: ComicInfo): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${tags({
  Title: c.title,
  Series: c.series,
  Number: c.number,
  Summary: c.summary,
  Year: c.year,
  Writer: c.writer,
  Penciller: c.penciller,
  LanguageISO: c.language,
  Manga: c.manga,
  PageCount: c.pageCount,
})}
</ComicInfo>
`;
}

/** metadata.opf as Calibre writes it next to a book. */
export function calibreOpf(b: {
  title: string;
  author: string;
  date: string;
  language: string;
  publisher: string;
  description: string;
  series: string;
  index: number;
  subjects: string[];
}): string {
  const subjects = b.subjects.map((s) => `    <dc:subject>${x(s)}</dc:subject>`).join("\n");
  return `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${x(b.title)}</dc:title>
    <dc:creator opf:file-as="${x(b.author)}" opf:role="aut">${x(b.author)}</dc:creator>
    <dc:date>${x(b.date)}</dc:date>
    <dc:language>${x(b.language)}</dc:language>
    <dc:publisher>${x(b.publisher)}</dc:publisher>
    <dc:description>${x(b.description)}</dc:description>
${subjects}
    <meta name="calibre:series" content="${x(b.series)}"/>
    <meta name="calibre:series_index" content="${b.index}"/>
  </metadata>
</package>
`;
}
