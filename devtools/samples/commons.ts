// Wikimedia Commons: addresses, licenses and choice of files by category.
import { userAgent } from "./lib.ts";

type Params = Record<string, string>;

async function api(params: Params): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://commons.wikimedia.org/w/api.php?format=json&${new URLSearchParams(params)}`,
    {
      headers: { "User-Agent": userAgent },
    },
  );
  if (!res.ok) throw new Error(`Commons: HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export interface CommonsFile {
  title: string;
  url: string;
  size: number;
  license: string;
  artist: string;
  descriptionUrl: string;
}

interface RawInfo {
  url: string;
  size: number;
  mime: string;
  descriptionurl: string;
  commonmetadata?: { name: string; value: unknown }[];
  extmetadata?: Record<string, { value: string }>;
}

const plain = (html: string | undefined) =>
  (html ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

function toFile(title: string, i: RawInfo): CommonsFile {
  return {
    title,
    url: i.url,
    size: i.size,
    license: plain(i.extmetadata?.LicenseShortName?.value),
    artist: plain(i.extmetadata?.Artist?.value) || "unknown",
    descriptionUrl: i.descriptionurl,
  };
}

/** Details of a file ("File:..."). */
export async function fileInfo(title: string): Promise<CommonsFile> {
  const r = (await api({
    action: "query",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist",
    titles: title,
  })) as { query: { pages: Record<string, { imageinfo?: RawInfo[] }> } };
  const info = Object.values(r.query.pages)[0]?.imageinfo?.[0];
  if (!info) throw new Error(`Commons: ${title} not found`);
  return toFile(title, info);
}

/** Address of a version transcoded by Commons ("480p.vp9.webm"). */
export async function derivative(title: string, key: string): Promise<string> {
  const r = (await api({ action: "query", prop: "videoinfo", viprop: "derivatives", titles: title })) as {
    query: {
      pages: Record<string, { videoinfo?: { derivatives: { src: string; transcodekey?: string }[] }[] }>;
    };
  };
  const found = Object.values(r.query.pages)[0]?.videoinfo?.[0]?.derivatives.find(
    (d) => d.transcodekey === key,
  );
  if (!found) throw new Error(`Commons: no ${key} version for ${title}`);
  return found.src;
}

/** Free licenses accepted (docs/design/sample-media.md): neither NC nor ND. */
export const freeLicense = /^(CC0|CC BY(-SA)? [0-9.]+|Public domain)$/;

/**
 * Files of a category that pass the filter, in title order; goes through the category page by page
 * until it has enough.
 */
export async function categoryFiles(
  category: string,
  keep: (file: CommonsFile, metadata: Record<string, unknown>, mime: string) => boolean,
  want: number,
): Promise<CommonsFile[]> {
  const found: CommonsFile[] = [];
  let next: Params = {};
  for (let page = 0; page < 6 && found.length < want; page++) {
    const r = (await api({
      action: "query",
      generator: "categorymembers",
      gcmtitle: `Category:${category}`,
      gcmtype: "file",
      gcmlimit: "100",
      prop: "imageinfo",
      iiprop: "url|size|mime|commonmetadata|extmetadata",
      iiextmetadatafilter: "LicenseShortName|Artist",
      ...next,
    })) as {
      query?: { pages: Record<string, { title: string; imageinfo?: RawInfo[] }> };
      continue?: Params;
    };
    const pages = Object.values(r.query?.pages ?? {}).sort((a, b) => a.title.localeCompare(b.title));
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info) continue;
      const metadata = Object.fromEntries((info.commonmetadata ?? []).map((m) => [m.name, m.value]));
      const file = toFile(p.title, info);
      if (freeLicense.test(file.license) && keep(file, metadata, info.mime)) found.push(file);
      if (found.length >= want) break;
    }
    if (!r.continue) break;
    next = r.continue;
  }
  return found;
}
