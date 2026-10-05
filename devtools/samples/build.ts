// Builds the free sample libraries used in development (docs/design/sample-media.md): downloads
// each source once (verified cache), lays it out with the names the server understands, writes the
// NFO, ComicInfo and OPF files, then ATTRIBUTIONS.md. Running it again only redoes what is missing.
//
//   pnpm samples           everything
//   pnpm samples movies    a single library (movies, shows, anime, music, books, photos)
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { categoryFiles, derivative, fileInfo } from "./commons.ts";
import {
  artwork,
  type Credit,
  cacheDir,
  download,
  duration,
  ensureDir,
  extract,
  ffmpeg,
  log,
  root,
  selection,
  thumb,
  writeText,
  zipDir,
} from "./lib.ts";
import {
  albumNfo,
  artistNfo,
  calibreOpf,
  comicInfo,
  type EpisodeInfo,
  episodeNfo,
  type MovieInfo,
  movieNfo,
  type ShowInfo,
  tvshowNfo,
} from "./nfo.ts";
import { jpegsToPdf } from "./pdf.ts";

const lib = {
  movies: join(root, "movies"),
  shows: join(root, "shows"),
  anime: join(root, "anime"),
  music: join(root, "music"),
  books: join(root, "books"),
  photos: join(root, "photos"),
};

const credits: Credit[] = [];
const credit = (c: Credit) => credits.push(c);

const archive = (id: string, file: string) =>
  `https://archive.org/download/${id}/${file.split("/").map(encodeURIComponent).join("/")}`;
const blender = (path: string) => `https://download.blender.org/${path}`;
const CC_BY_3 = "https://creativecommons.org/licenses/by/3.0/";
const CC_BY_4 = "https://creativecommons.org/licenses/by/4.0/";
const CC_BY_SA_4 = "https://creativecommons.org/licenses/by-sa/4.0/";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";

/** Names of the files of an archive.org item that pass the filter, in natural order. */
async function archiveFiles(id: string, keep: RegExp): Promise<string[]> {
  const res = await fetch(`https://archive.org/metadata/${id}`);
  const meta = (await res.json()) as { files: { name: string }[] };
  return meta.files
    .map((f) => f.name)
    .filter((n) => keep.test(n))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/** Encoding of a subtitle file: UTF-8 if it is valid, otherwise the one given. */
function charenc(file: string, fallback = "CP1252"): string {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(file));
    return "UTF-8";
  } catch {
    return fallback;
  }
}

/** File looked up by name in a folder and its subfolders. */
function findFile(dir: string, name: string): string | undefined {
  for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (basename(entry) === name) return join(dir, entry);
  }
  return undefined;
}

/** Downloads an archive and extracts one file from it (once). */
async function fromZip(name: string, url: string, inner: string): Promise<string> {
  const zip = await download(name, url);
  const dir = join(cacheDir, name.replace(/\.(zip|tar)$/, ""));
  let file = existsSync(dir) ? findFile(dir, inner) : undefined;
  if (!file) {
    extract(zip, dir);
    file = findFile(dir, inner);
  }
  if (!file) throw new Error(`${inner} not found in ${name}`);
  return file;
}

/** Produces a file with a step (FFmpeg, copy...) into a temporary file, then renames it. */
async function produce(out: string, make: (tmp: string) => void | Promise<void>): Promise<void> {
  if (existsSync(out)) return;
  ensureDir(dirname(out));
  const tmp = join(dirname(out), `.partial${extname(out)}`);
  rmSync(tmp, { force: true });
  await make(tmp);
  renameSync(tmp, out);
  log(`  written: ${out.slice(root.length + 1)}`);
}

const copy = (from: string) => (tmp: string) => copyFileSync(from, tmp);

/** Puts a source as is in its place; only downloads it if it is missing. */
async function fetched(out: string, name: string, url: string): Promise<void> {
  if (!existsSync(out)) await produce(out, copy(await download(name, url)));
}
const silent = (from: string) => (tmp: string) => ffmpeg(["-i", from, "-map", "0:v", "-c", "copy", tmp]);
/**
 * Remuxes a video with chapters added (title, start in seconds; each ends where the next one
 * starts, the last at the end of the file).
 */
const withChapters = (from: string, chapters: [string, number][]) => (tmp: string) => {
  const end = duration(from);
  const meta = join(cacheDir, `${basename(from)}.chapters.txt`);
  const lines = chapters.flatMap(([title, start], i) => [
    "[CHAPTER]",
    "TIMEBASE=1/1000",
    `START=${Math.round(start * 1000)}`,
    `END=${Math.round((chapters[i + 1]?.[1] ?? end) * 1000)}`,
    `title=${title}`,
  ]);
  writeFileSync(meta, [";FFMETADATA1", ...lines, ""].join("\n"));
  ffmpeg(["-i", from, "-i", meta, "-map", "0", "-map_chapters", "1", "-c", "copy", tmp]);
};
const minutes = (file: string) => Math.max(1, Math.round(duration(file) / 60));

// --- Movies ----------------------------------------------------------------------------------

const blenderSet = {
  name: "Blender open movies",
  overview:
    "The open movies made by the Blender Foundation and Blender Studio, under Creative Commons licenses.",
};
const lumiereSet = {
  name: "Lumière brothers films",
  overview: "The first views filmed by Louis and Auguste Lumière, at the very beginning of cinema.",
};

interface Sidecar {
  lang: string;
  url: string;
}

async function movie(o: {
  name: string;
  ext: string;
  info: Omit<MovieInfo, "runtime">;
  make: () => Promise<(tmp: string) => void | Promise<void>>;
  sidecars?: Sidecar[];
  credit: Omit<Credit, "library" | "work">;
}): Promise<void> {
  log(`Movie: ${o.name}`);
  const dir = join(lib.movies, o.name);
  const video = join(dir, `${o.name}.${o.ext}`);
  if (!existsSync(video)) await produce(video, await o.make());
  for (const s of o.sidecars ?? []) {
    const name = `${o.name}.${s.lang}${extname(new URL(s.url).pathname)}`;
    await fetched(join(dir, name), name, s.url);
  }
  writeText(join(dir, "movie.nfo"), movieNfo({ ...o.info, runtime: minutes(video) }));
  artwork(video, dir);
  credit({ library: "Movies", work: `${o.info.title} (${o.info.year})`, ...o.credit });
}

async function movies(): Promise<void> {
  await movie({
    name: "Big Buck Bunny (2008)",
    ext: "mp4",
    info: {
      title: "Big Buck Bunny",
      year: 2008,
      plot: "A giant, peaceful rabbit is bullied by three mischievous rodents. His patience has limits: he plans a revenge as inventive as it is deserved.",
      genres: ["Animation", "Comedy"],
      mpaa: "US:G",
      directors: ["Sacha Goedegebure"],
      studios: ["Blender Institute"],
      country: "Netherlands",
      set: blenderSet,
    },
    make: async () =>
      copy(
        await fromZip(
          "bbb_sunflower_1080p_30fps_normal.mp4.zip",
          blender("demo/movies/BBB/bbb_sunflower_1080p_30fps_normal.mp4.zip"),
          "bbb_sunflower_1080p_30fps_normal.mp4",
        ),
      ),
    credit: {
      author: "Blender Foundation, peach.blender.org",
      license: "CC BY 3.0",
      licenseUrl: CC_BY_3,
      source: blender("demo/movies/BBB/"),
    },
  });

  await movie({
    name: "Sintel (2010)",
    ext: "mkv",
    info: {
      title: "Sintel",
      year: 2010,
      plot: "Sintel, a lonely young woman, takes in a wounded baby dragon she names Scales. When it is taken from her, she crosses hostile lands to find it.",
      genres: ["Animation", "Fantasy", "Adventure"],
      mpaa: "US:PG",
      directors: ["Colin Levy"],
      studios: ["Blender Institute"],
      country: "Netherlands",
      set: blenderSet,
    },
    make: async () =>
      copy(
        await fromZip(
          "Sintel.2010.720p.mkv.zip",
          blender("durian/movies/Sintel.2010.720p.mkv.zip"),
          "Sintel.2010.720p.mkv",
        ),
      ),
    sidecars: ["fr", "ja", "nl", "ru", "pl"].map((lang) => ({
      lang,
      url: blender(`durian/subs/sintel_${lang === "ja" ? "jp" : lang}.srt`),
    })),
    credit: {
      author: "Blender Foundation, durian.blender.org",
      license: "CC BY 3.0",
      licenseUrl: CC_BY_3,
      source: blender("durian/"),
      changes: "official subtitles placed next to the movie",
    },
  });

  const tosSubs: [string, string, string][] = [
    ["eng", "English", "TOS-en.srt"],
    ["fre", "French", "TOS-fr-orig.srt"],
    ["ger", "German", "TOS-de.srt"],
    ["spa", "Spanish", "TOS-es.srt"],
    ["ita", "Italian", "TOS-it.srt"],
    ["jpn", "Japanese", "TOS-JP.srt"],
  ];
  await movie({
    name: "Tears of Steel (2012)",
    ext: "mkv",
    info: {
      title: "Tears of Steel",
      year: 2012,
      plot: "In a futuristic Amsterdam overrun by robots, a group of scientists tries to replay the breakup of a couple, years earlier, to save the world.",
      genres: ["Science Fiction", "Action"],
      mpaa: "US:PG-13",
      directors: ["Ian Hubert"],
      studios: ["Blender Institute"],
      country: "Netherlands",
      set: blenderSet,
    },
    make: async () => {
      const video = await fromZip(
        "tears_of_steel_1080p.webm.zip",
        blender("demo/movies/ToS/tears_of_steel_1080p.webm.zip"),
        "tears_of_steel_1080p.webm",
      );
      const subs = await Promise.all(
        tosSubs.map(([, , file]) => download(file, blender(`demo/movies/ToS/subtitles/${file}`))),
      );
      return (tmp) =>
        ffmpeg([
          "-i",
          video,
          ...subs.flatMap((s, i) => [
            "-sub_charenc",
            charenc(s, tosSubs[i]?.[0] === "jpn" ? "SHIFT_JIS" : "CP1252"),
            "-i",
            s,
          ]),
          "-map",
          "0:v",
          "-map",
          "0:a",
          ...subs.flatMap((_, i) => ["-map", String(i + 1)]),
          "-c:v",
          "copy",
          "-c:a",
          "copy",
          "-c:s",
          "srt",
          ...tosSubs.flatMap(([lang, title], i) => [
            `-metadata:s:s:${i}`,
            `language=${lang}`,
            `-metadata:s:s:${i}`,
            `title=${title}`,
          ]),
          tmp,
        ]);
    },
    credit: {
      author: "Blender Foundation, mango.blender.org",
      license: "CC BY 3.0",
      licenseUrl: CC_BY_3,
      source: blender("demo/movies/ToS/"),
      changes: "six official subtitles muxed into the MKV file",
    },
  });

  await movie({
    name: "Cosmos Laundromat (2015)",
    ext: "mkv",
    info: {
      title: "Cosmos Laundromat",
      originaltitle: "Cosmos Laundromat: First Cycle",
      year: 2015,
      plot: "On a desolate island, Franck, a suicidal sheep, meets Victor, a strange salesman who offers him a magic jacket... and a series of unexpected lives.",
      genres: ["Animation", "Fantasy", "Comedy"],
      mpaa: "US:PG",
      directors: ["Mathieu Auvray"],
      studios: ["Blender Institute"],
      country: "Netherlands",
      set: blenderSet,
    },
    make: async () => {
      const video = await download(
        "Cosmos Laundromat - First Cycle (1080p).mp4",
        archive("CosmosLaundromatFirstCycle", "Cosmos Laundromat - First Cycle (1080p).mp4"),
      );
      const fr = await download(
        "CosmosLaundromat-FirstCycle1080p.fr.srt",
        archive("CosmosLaundromatFirstCycle", "CosmosLaundromat-FirstCycle1080p.fr.srt"),
      );
      const font = await download(
        "Fredoka[wdth,wght].ttf",
        "https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf",
      );
      await download("Fredoka-OFL.txt", "https://github.com/google/fonts/raw/main/ofl/fredoka/OFL.txt");
      // Styled ASS made from the French SRT, with the Fredoka font attached to the MKV (served by
      // /fonts). The font is variable: its legacy family name (nameID 1), the only one libass
      // reads, is the default instance's, "Fredoka Light".
      const ass = join(cacheDir, "cosmos.fr.ass");
      if (!existsSync(ass)) {
        ffmpeg(["-sub_charenc", charenc(fr), "-i", fr, ass]);
        const styled = readFileSync(ass, "utf8").replace(
          /^Style: Default,.*$/m,
          "Style: Default,Fredoka Light,22,&H0000E5FF,&H000000FF,&H00141414,&H64000000,-1,0,0,0,100,100,0,0,1,2.4,1,2,40,40,24,1",
        );
        writeFileSync(ass, styled);
      }
      return (tmp) =>
        ffmpeg([
          "-i",
          video,
          "-i",
          ass,
          "-attach",
          font,
          "-map",
          "0:v",
          "-map",
          "0:a",
          "-map",
          "1",
          "-c",
          "copy",
          "-metadata:s:s:0",
          "language=fre",
          "-metadata:s:s:0",
          "title=French (styled)",
          "-metadata:s:t:0",
          "mimetype=font/ttf",
          "-metadata:s:t:0",
          "filename=Fredoka.ttf",
          tmp,
        ]);
    },
    sidecars: ["en", "es", "fr", "it"].map((lang) => ({
      lang,
      url: archive("CosmosLaundromatFirstCycle", `CosmosLaundromat-FirstCycle1080p.${lang}.srt`),
    })),
    credit: {
      author: "Blender Foundation, gooseberry.blender.org",
      license: "CC BY 4.0",
      licenseUrl: CC_BY_4,
      source: "https://archive.org/details/CosmosLaundromatFirstCycle",
      changes:
        "remuxed to MKV with a styled ASS track made from the French subtitles and the Fredoka font (SIL OFL 1.1, The Fredoka Project Authors); SRT subtitles placed next to it",
    },
  });

  await movie({
    name: "Spring (2019)",
    ext: "mp4",
    info: {
      title: "Spring",
      year: 2019,
      plot: "A young shepherd girl and her dog face ancient spirits so that the cycle of life can resume at the end of winter.",
      genres: ["Animation", "Fantasy"],
      mpaa: "US:G",
      directors: ["Andy Goralczyk"],
      studios: ["Blender Animation Studio"],
      country: "Netherlands",
      set: blenderSet,
    },
    make: async () =>
      copy(await download("springopenmovie.mp4", archive("springopenmovie", "springopenmovie.mp4"))),
    credit: {
      author: "Blender Animation Studio",
      license: "CC BY 4.0",
      licenseUrl: CC_BY_4,
      source: "https://archive.org/details/springopenmovie",
    },
  });

  await movie({
    name: "Elephants Dream (2006)",
    ext: "mov",
    info: {
      title: "Elephants Dream",
      year: 2006,
      plot: "In an endless machine, old Proog guides young Emo through a strange world that they do not see the same way.",
      genres: ["Animation", "Science Fiction"],
      mpaa: "US:PG",
      directors: ["Bassam Kurdali"],
      studios: ["Orange Open Movie Project", "Blender Foundation"],
      country: "Netherlands",
      set: blenderSet,
    },
    make: async () =>
      copy(
        await download(
          "elephantsdream-720-h264-st-aac.mov",
          blender("ED/elephantsdream-720-h264-st-aac.mov"),
        ),
      ),
    credit: {
      author: "Orange Open Movie Project, Blender Foundation",
      license: "CC BY 2.5",
      licenseUrl: "https://creativecommons.org/licenses/by/2.5/",
      source: blender("ED/"),
    },
  });

  const commonsFilm = async (title: string, key?: string) => {
    const info = await fileInfo(title);
    const url = key ? await derivative(title, key) : info.url;
    const name = basename(decodeURIComponent(new URL(url).pathname));
    return { info, file: await download(name, url) };
  };

  for (const f of [
    {
      name: "Nosferatu (1922)",
      file: "File:Nosferatu le vampire-Film Murnau 1922.webm",
      key: undefined,
      info: {
        title: "Nosferatu",
        originaltitle: "Nosferatu, eine Symphonie des Grauens",
        year: 1922,
        plot: "Sent to the Carpathians to sell a house to Count Orlok, the estate agent Hutter finds out he is dealing with a vampire, who soon leaves to spread the plague in his town.",
        genres: ["Horror", "Fantasy", "Silent"],
        mpaa: "US:PG-13",
        directors: ["Friedrich Wilhelm Murnau"],
        credits: ["Henrik Galeen"],
        studios: ["Prana-Film"],
        country: "Germany",
      },
      author: "Friedrich Wilhelm Murnau (1888-1931), Henrik Galeen (1881-1949)",
    },
    {
      name: "A Trip to the Moon (1902)",
      file: "File:Le Voyage dans la Lune (1902).webm",
      key: "480p.vp9.webm",
      info: {
        title: "A Trip to the Moon",
        originaltitle: "Le Voyage dans la Lune",
        year: 1902,
        plot: "Professor Barbenfouillis and five astronomers fly off in a shell fired from a giant cannon, land in the eye of the Moon and meet the Selenites there.",
        genres: ["Science Fiction", "Adventure", "Silent"],
        mpaa: "US:G",
        directors: ["Georges Méliès"],
        studios: ["Star Film"],
        country: "France",
      },
      author: "Georges Méliès (1861-1938)",
    },
    {
      name: "The Arrival of a Train at La Ciotat (1896)",
      file: "File:Arrival of a Train at La Ciotat (The Lumière Brothers, 1895).webm",
      key: undefined,
      info: {
        title: "The Arrival of a Train at La Ciotat",
        originaltitle: "L'Arrivée d'un train en gare de La Ciotat",
        year: 1896,
        plot: "A steam train pulls into La Ciotat station and the passengers step onto the platform. A single shot, a few seconds, and a legend of cinema.",
        genres: ["Documentary", "Silent"],
        mpaa: "US:G",
        directors: ["Louis Lumière", "Auguste Lumière"],
        studios: ["Société Lumière"],
        country: "France",
        set: lumiereSet,
      },
      author: "Louis Lumière (1864-1948), Auguste Lumière (1862-1954)",
    },
    {
      name: "Workers Leaving the Lumière Factory (1895)",
      file: "File:La Sortie de l'Usine Lumière à Lyon I 1895.webm",
      key: undefined,
      info: {
        title: "Workers Leaving the Lumière Factory",
        originaltitle: "La Sortie de l'usine Lumière à Lyon",
        year: 1895,
        plot: "At the end of the day, the workers leave the Lumière factory in Monplaisir. One of the very first films in history.",
        genres: ["Documentary", "Silent"],
        mpaa: "US:G",
        directors: ["Louis Lumière"],
        studios: ["Société Lumière"],
        country: "France",
        set: lumiereSet,
      },
      author: "Louis Lumière (1864-1948)",
    },
  ]) {
    const page = (await fileInfo(f.file)).descriptionUrl;
    await movie({
      name: f.name,
      ext: "mkv",
      info: f.info,
      make: async () => silent((await commonsFilm(f.file, f.key)).file),
      credit: {
        author: f.author,
        license: "Public domain",
        source: page,
        changes: "sound track removed (music added later, of uncertain status); remuxed to MKV",
      },
    });
  }
}

// --- Shows -----------------------------------------------------------------------------------

async function show(o: {
  root: string;
  name: string;
  info: ShowInfo;
  seasonDir?: string;
  episodes: { file: string; info: EpisodeInfo; make: () => Promise<(tmp: string) => void | Promise<void>> }[];
}): Promise<string[]> {
  log(`Show: ${o.name}`);
  const dir = join(o.root, o.name);
  const videos: string[] = [];
  for (const e of o.episodes) {
    const video = join(dir, o.seasonDir ?? "", e.file);
    if (!existsSync(video)) await produce(video, await e.make());
    const stem = video.slice(0, -extname(video).length);
    writeText(`${stem}.nfo`, episodeNfo(e.info));
    thumb(video, `${stem}-thumb.jpg`);
    videos.push(video);
  }
  writeText(join(dir, "tvshow.nfo"), tvshowNfo(o.info));
  const first = videos[0];
  if (first) {
    artwork(first, dir);
    const season = join(dir, "season01-poster.jpg");
    if (!existsSync(season)) copyFileSync(join(dir, "poster.jpg"), season);
  }
  return videos;
}

async function shows(): Promise<void> {
  const cam = [
    {
      id: "Caminandes1LlamaDrama",
      file: "01_llama_drama_1080p.mp4",
      n: 1,
      title: "Llama Drama",
      year: 2013,
      plot: "Koro wants to cross the road: the electric fence has other plans.",
    },
    {
      id: "Caminandes2GranDillama",
      file: "02_gran_dillama_1080p.mp4",
      n: 2,
      title: "Gran Dillama",
      year: 2013,
      plot: "The grass is always greener on the other side of the fence, and Koro will do anything to taste it.",
    },
    {
      id: "CaminandesLlamigos",
      file: "Caminandes_ Llamigos-1080p.mp4",
      n: 3,
      title: "Llamigos",
      year: 2016,
      plot: "In the middle of winter, Koro fights over the last berries with Oti, a penguin as stubborn as he is.",
    },
  ];
  await show({
    root: lib.shows,
    name: "Caminandes (2013)",
    seasonDir: "Season 1",
    info: {
      title: "Caminandes",
      year: 2013,
      plot: "Koro, a stubborn and hungry Patagonian llama, tries every way to get past a fence, grab a berry or get rid of an intrusive penguin.",
      genres: ["Animation", "Comedy"],
      mpaa: "US:G",
      studios: ["Blender Institute"],
    },
    episodes: cam.map((e) => ({
      file: `Caminandes - S01E0${e.n} - ${e.title}.mp4`,
      info: {
        title: e.title,
        season: 1,
        episode: e.n,
        aired: `${e.year}`,
        plot: e.plot,
        directors: ["Pablo Vazquez"],
      },
      make: async () => copy(await download(e.file.replace(/ /g, "_"), archive(e.id, e.file))),
    })),
  });
  credit({
    library: "Shows",
    work: "Caminandes, episodes 1 to 3 (2013-2016)",
    author: "Pablo Vazquez, Blender Foundation",
    license: "CC BY 3.0",
    licenseUrl: CC_BY_3,
    source: "https://archive.org/details/CaminandesLlamigos",
  });

  const vampires = [
    {
      n: 1,
      title: "The Severed Head",
      file: "File:Les Vampires - La tête coupée (1915).webm",
      plot: "The journalist Philippe Guérande sets off on the trail of the Vampires, an elusive gang of criminals.",
    },
    {
      n: 3,
      title: "The Red Codebook",
      file: "File:Les Vampires - Le Cryptogramme rouge (1915).webm",
      plot: "A coded notebook could give away the gang's secrets.",
    },
    {
      n: 4,
      title: "The Spectre",
      file: "File:Les Vampires - Le Spectre (1916).webm",
      plot: "The Vampires plan a new strike, and Guérande no longer knows whom to trust.",
    },
    {
      n: 7,
      title: "Satanas",
      file: "File:Les Vampires - Satanas(1916).webm",
      plot: "A new master of crime enters the scene: Satanas.",
    },
  ];
  await show({
    root: lib.shows,
    name: "Les Vampires (1915)",
    seasonDir: "Season 1",
    info: {
      title: "Les Vampires",
      year: 1915,
      plot: "The journalist Philippe Guérande hunts the Vampires, a gang of criminals led by the Grand Vampire and the formidable Irma Vep. A silent serial in ten episodes.",
      genres: ["Crime", "Adventure", "Silent"],
      mpaa: "US:PG-13",
      studios: ["Gaumont"],
    },
    episodes: vampires.map((e) => ({
      file: `Les Vampires - S01E${String(e.n).padStart(2, "0")} - ${e.title}.mkv`,
      info: { title: e.title, season: 1, episode: e.n, plot: e.plot, directors: ["Louis Feuillade"] },
      make: async () => {
        const info = await fileInfo(e.file);
        return silent(await download(basename(decodeURIComponent(new URL(info.url).pathname)), info.url));
      },
    })),
  });
  credit({
    library: "Shows",
    work: "Les Vampires, episodes 1, 3, 4 and 7 (1915-1916)",
    author: "Louis Feuillade (1873-1925)",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/Category:Les_Vampires_(film)",
    changes: "sound track removed; remuxed to MKV",
  });
}

// --- Anime -----------------------------------------------------------------------------------

async function anime(): Promise<void> {
  const morevnaSubs: [string, string][] = [
    ["de", "German"],
    ["en", "English"],
    ["es", "Spanish"],
    ["fr", "French"],
    ["ko", "Korean"],
    ["pl", "Polish"],
    ["pt-br", "Portuguese"],
    ["ru", "Russian"],
  ];
  const [ep3] = await show({
    root: lib.anime,
    name: "Marya Morevna",
    info: {
      title: "Marya Morevna",
      year: 2015,
      plot: "A free adaptation, in anime style, of the Russian fairy tale Marya Morevna, made entirely with free software by the Morevna Project.",
      genres: ["Animation", "Fantasy", "Action"],
      mpaa: "US:PG",
      studios: ["Morevna Project"],
    },
    episodes: [
      {
        file: "[Morevna Project] Marya Morevna - 03 [1080p].mp4",
        info: {
          title: "Underground",
          season: 1,
          episode: 3,
          plot: "Third episode of the adaptation of the tale.",
        },
        // Chapters found by watching: title card, end credits, after-credits scene (the player
        // offers to skip the intro, then the next episode).
        make: async () =>
          withChapters(
            await download(
              "morevna-episode-3.0.1.mp4",
              archive("morevna-episode-3.0.1", "morevna-episode-3.0.1.mp4"),
            ),
            [
              ["Prologue", 0],
              ["Opening", 83],
              ["Episode", 93],
              ["End credits", 617],
              ["After the credits", 686],
            ],
          ),
      },
      {
        file: "[Morevna Project] Marya Morevna - 04 [1080p].mp4",
        info: { title: "Episode 4", season: 1, episode: 4, plot: "Fourth episode, in Russian." },
        make: async () =>
          copy(await download("morevna-4.0.1.mp4", archive("morevna-4.0.1", "morevna-4.0.1.mp4"))),
      },
    ],
  });
  if (ep3) {
    // "Subs/<video name>/<Language>.srt" layout (subtitles of a show).
    const subsDir = join(dirname(ep3), "Subs", basename(ep3, extname(ep3)));
    for (const [code, language] of morevnaSubs) {
      await fetched(
        join(subsDir, `${language}.srt`),
        `Marya Morevna - Episode 301.${code}.srt`,
        archive("morevna-episode-3.0.1", `subtitles/Marya Morevna - Episode 301.${code}.srt`),
      );
    }
  }
  credit({
    library: "Anime",
    work: "Marya Morevna, episodes 3 and 4, with their subtitles",
    author: "Morevna Project",
    license: "CC BY-SA 3.0 (episode 3), CC BY-SA 4.0 (episode 4)",
    licenseUrl: CC_BY_SA_4,
    source: "https://archive.org/details/morevna-episode-3.0.1",
    changes: "chapters added to episode 3; subtitles placed in Subs/",
  });

  await show({
    root: lib.anime,
    name: "Pepper&Carrot",
    info: {
      title: "Pepper&Carrot",
      year: 2016,
      plot: "Pepper, a young witch of the Chaosah school, and her cat Carrot go from failed potions to adventures, after the free comic by David Revoy.",
      genres: ["Animation", "Fantasy", "Comedy"],
      mpaa: "US:G",
      studios: ["Morevna Project"],
    },
    episodes: [
      {
        file: "Pepper&Carrot - 03 [1080p].mp4",
        info: {
          title: "The Secret Ingredients",
          season: 1,
          episode: 3,
          plot: "Pepper goes to the market for the ingredients of a contest potion.",
        },
        make: async () =>
          copy(
            await download(
              "pepper-carrot-ep3-1080.mp4",
              archive(
                "pepper-carrot-episode-3-the-secret-ingredients-english",
                "79780d2c-419b-42a3-adb5-85ae2aea4d1e-1080.mp4",
              ),
            ),
          ),
      },
      {
        file: "Pepper&Carrot - 04 [1080p].mp4",
        info: {
          title: "Stroke of Genius",
          season: 1,
          episode: 4,
          plot: "The day before a contest, Pepper invents a potion of genius... for Carrot.",
        },
        make: async () =>
          copy(
            await download(
              "pepper-carrot-ep4-1080.mp4",
              archive(
                "pepper-carrot-episode-4-stroke-of-genius-1080p",
                "Pepper & Carrot Episode 4: Stroke of Genius 1080p.mp4",
              ),
            ),
          ),
      },
      {
        file: "Pepper&Carrot - 06 [1080p].mkv",
        info: {
          title: "The Potion Contest",
          season: 1,
          episode: 6,
          plot: "The great potion contest of Komona: two audio tracks, English and Russian.",
        },
        make: async () => {
          const en = await download(
            "pepper-and-carrot-ep6-en-v1.mp4",
            archive("pepper-and-carrot-ep6-v1", "pepper-and-carrot-ep6-en-v1.mp4"),
          );
          const ru = await download(
            "pepper-and-carrot-ep6-ru-v1.mp4",
            archive("pepper-and-carrot-ep6-v1", "pepper-and-carrot-ep6-ru-v1.mp4"),
          );
          return (tmp) =>
            ffmpeg([
              "-i",
              en,
              "-i",
              ru,
              "-map",
              "0:v",
              "-map",
              "0:a",
              "-map",
              "1:a",
              "-c",
              "copy",
              "-metadata:s:a:0",
              "language=eng",
              "-metadata:s:a:0",
              "title=English",
              "-metadata:s:a:1",
              "language=rus",
              "-metadata:s:a:1",
              "title=Русский",
              tmp,
            ]);
        },
      },
    ],
  });
  credit({
    library: "Anime",
    work: "Pepper&Carrot (animated), episodes 3, 4 and 6",
    author: "Morevna Project, after David Revoy",
    license: "CC BY-SA 4.0",
    licenseUrl: CC_BY_SA_4,
    source: "https://archive.org/details/pepper-and-carrot-ep6-v1",
    changes: "episode 6: English and Russian versions combined into one MKV with two audio tracks",
  });
}

// --- Music -----------------------------------------------------------------------------------

interface Tags {
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  track: number;
  tracks: number;
  date?: string;
  genre: string;
}

/** Copies a track, rewriting its tags (without re-encoding). */
function tagged(from: string, t: Tags) {
  return (tmp: string) =>
    ffmpeg([
      "-i",
      from,
      "-map",
      "0",
      "-map_metadata",
      "-1",
      "-c",
      "copy",
      ...(tmp.endsWith(".mp3") ? ["-id3v2_version", "3"] : []),
      "-metadata",
      `title=${t.title}`,
      "-metadata",
      `artist=${t.artist}`,
      "-metadata",
      `album_artist=${t.albumArtist}`,
      "-metadata",
      `album=${t.album}`,
      "-metadata",
      `track=${t.track}/${t.tracks}`,
      ...(t.date ? ["-metadata", `date=${t.date}`] : []),
      "-metadata",
      `genre=${t.genre}`,
      tmp,
    ]);
}

/** ReplayGain measured by FFmpeg (replaygain filter) on a track, or on an album played end to end. */
function measureGain(files: string[]): { gain: string; peak: string } {
  const inputs = files.flatMap((file) => ["-i", file]);
  const each = files.map((_, i) => `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
  const joined = `${files.map((_, i) => `[a${i}]`).join("")}concat=n=${files.length}:v=0:a=1,replaygain`;
  const out = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      ...inputs,
      "-filter_complex",
      [...each, joined].join(";"),
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const gain = out.stderr.match(/track_gain = ([+-]?[\d.]+) dB/)?.[1];
  const peak = out.stderr.match(/track_peak = ([\d.]+)/)?.[1];
  if (!gain || !peak) throw new Error(`unreadable ReplayGain for ${files[0]}`);
  return { gain: `${gain} dB`, peak };
}

/** Does the track already carry its ReplayGain tags? */
function hasReplayGain(file: string): boolean {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "json", file], {
    encoding: "utf8",
  });
  const tags = (JSON.parse(out) as { format?: { tags?: Record<string, string> } }).format?.tags ?? {};
  return Object.keys(tags).some((k) => k.toLowerCase() === "replaygain_album_gain");
}

/**
 * Adds track and album ReplayGain to the tracks of a folder, without re-encoding, so that the
 * player can level the volume. Does nothing on an album already measured.
 */
function replayGain(dir: string): void {
  const files = readdirSync(dir)
    .filter((name) => /\.(mp3|flac)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((name) => join(dir, name));
  if (files.length === 0 || files.every(hasReplayGain)) return;
  log(`  ReplayGain: ${basename(dir)}`);
  const album = measureGain(files);
  for (const file of files) {
    const track = measureGain([file]);
    const tmp = join(dir, `.partial${extname(file)}`);
    ffmpeg([
      "-i",
      file,
      "-map",
      "0",
      "-c",
      "copy",
      ...(file.endsWith(".mp3") ? ["-id3v2_version", "3"] : []),
      "-metadata",
      `REPLAYGAIN_TRACK_GAIN=${track.gain}`,
      "-metadata",
      `REPLAYGAIN_TRACK_PEAK=${track.peak}`,
      "-metadata",
      `REPLAYGAIN_ALBUM_GAIN=${album.gain}`,
      "-metadata",
      `REPLAYGAIN_ALBUM_PEAK=${album.peak}`,
      tmp,
    ]);
    renameSync(tmp, file);
  }
}

/**
 * Commons image cropped to a square (album cover, artist photo). top: where the square sits in the
 * height of an image taller than wide (0 at the top, 1 at the bottom).
 */
async function commonsSquare(title: string, out: string, top = 0.5): Promise<void> {
  if (existsSync(out)) return;
  const info = await fileInfo(title);
  const src = await download(
    decodeURIComponent(new URL(info.url).pathname.split("/").pop() ?? title),
    info.url,
  );
  await produce(out, (tmp) =>
    ffmpeg([
      "-i",
      src,
      "-vf",
      `crop='min(iw,ih)':'min(iw,ih)':'(iw-min(iw,ih))/2':'(ih-min(iw,ih))*${top}',scale=1000:1000`,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      tmp,
    ]),
  );
}

async function album(o: {
  artist: string;
  album: string;
  folder: string;
  year?: number;
  genre: string;
  review: string;
  /** Number of tracks of the complete album, if some are missing. */
  total?: number;
  tracks: { title: string; name: string; url: string; n?: number }[];
  /** Cover: a file downloaded as is, or a Commons image cropped to a square. */
  cover?: { name: string; url: string } | { commons: string; top?: number };
}): Promise<void> {
  log(`Album: ${o.artist} - ${o.album}`);
  const dir = join(lib.music, o.artist, o.folder);
  for (const [i, t] of o.tracks.entries()) {
    const track = t.n ?? i + 1;
    const n = String(track).padStart(2, "0");
    const safe = t.title.replace(/[<>:"/\\|?*]/g, "");
    const out = join(dir, `${n} - ${safe}${extname(t.name)}`);
    if (existsSync(out)) continue;
    const src = await download(t.name, t.url);
    await produce(
      out,
      tagged(src, {
        title: t.title,
        artist: o.artist,
        albumArtist: o.artist,
        album: o.album,
        track,
        tracks: o.total ?? o.tracks.length,
        date: o.year ? String(o.year) : undefined,
        genre: o.genre,
      }),
    );
  }
  const cover = join(dir, "cover.jpg");
  if (o.cover && "commons" in o.cover) await commonsSquare(o.cover.commons, cover, o.cover.top);
  else if (o.cover && !existsSync(cover)) {
    ensureDir(dir);
    copyFileSync(await download(o.cover.name, o.cover.url), cover);
  }
  replayGain(dir);
  writeText(
    join(dir, "album.nfo"),
    albumNfo({ title: o.album, artist: o.artist, year: o.year, genres: [o.genre], review: o.review }),
  );
}

async function music(): Promise<void> {
  const chopin = "Frédéric Chopin";
  const number = (name: string) => Number(name.match(/no\. ?(\d+)/)?.[1] ?? 0);
  writeText(
    join(lib.music, chopin, "artist.nfo"),
    artistNfo({
      name: chopin,
      biography:
        "Polish-French composer and pianist (1810-1849), a master of the Romantic piano: nocturnes, preludes, ballades, mazurkas.",
      genres: ["Classical"],
    }),
  );
  // The only photograph of Chopin, by Louis-Auguste Bisson (1849): the face is at the top.
  await commonsSquare("File:Frederic Chopin photo.jpeg", join(lib.music, chopin, "artist.jpg"), 0.2);
  await album({
    artist: chopin,
    album: "24 Preludes, Op. 28",
    total: 24,
    folder: "24 Preludes, Op. 28",
    genre: "Classical",
    review: "The preludes of opus 28, recorded by Musopen and released into the public domain.",
    cover: { commons: "File:Chopin – Prelude Op. 28 No. 4 (First German Edition).png" },
    tracks: (await archiveFiles("musopen-chopin", /^Prelude Op\. 28 no\. ?\d+\.mp3$/)).map((name) => ({
      title: `Prelude Op. 28 No. ${number(name)}`,
      n: number(name),
      name,
      url: archive("musopen-chopin", name),
    })),
  });
  await album({
    artist: chopin,
    album: "Nocturnes, Op. 9",
    folder: "Nocturnes, Op. 9",
    genre: "Classical",
    review: "The three nocturnes of opus 9, in FLAC, recorded by Musopen.",
    cover: { commons: "File:Eugène Delacroix - Frédéric Chopin - WGA06194.jpg", top: 0.3 },
    tracks: [
      ["Nocturne in B-flat minor, Op. 9 No. 1", "Nocturne in B flat minor, Op. 9 no. 1.flac"],
      ["Nocturne in E-flat major, Op. 9 No. 2", "Nocturne in E flat major, Op. 9 no. 2.flac"],
      ["Nocturne in B major, Op. 9 No. 3", "Nocturne in B major, Op. 9 no. 3.flac"],
    ].map(([title, name]) => ({
      title: title ?? "",
      name: name ?? "",
      url: archive("musopen-chopin-complete-works-flac", name ?? ""),
    })),
  });
  credit({
    library: "Music",
    work: "Frédéric Chopin, 24 Preludes Op. 28 and Nocturnes Op. 9 (Musopen recordings)",
    author: "Musopen",
    license: "CC0 / public domain",
    licenseUrl: CC0,
    source: "https://archive.org/details/musopen-chopin",
    changes: "tags rewritten, track and album ReplayGain added",
  });
  credit({
    library: "Music",
    work: "Images of Frédéric Chopin: photograph (1849), portrait (1838), first German edition of the Prelude Op. 28 No. 4 (1839)",
    author: "Louis-Auguste Bisson, Eugène Delacroix, Breitkopf & Härtel",
    license: "Public domain",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
    source: "https://commons.wikimedia.org/wiki/File:Frederic_Chopin_photo.jpeg",
    changes: "cropped to squares: the artist photo, covers of the Preludes and the Nocturnes",
  });

  const macleod = "Kevin MacLeod";
  await album({
    artist: macleod,
    album: "Funk Sampler",
    folder: "Funk Sampler",
    genre: "Funk",
    review: "Funk tracks by Kevin MacLeod, under a Creative Commons license.",
    tracks: (await archiveFiles("Funk_Sampler-9613", /^Kevin_MacLeod_-_\d+_-_.+\.mp3$/)).map((name) => ({
      title: name
        .replace(/^Kevin_MacLeod_-_\d+_-_/, "")
        .replace(/\.mp3$/, "")
        .replace(/_/g, " "),
      name,
      url: archive("Funk_Sampler-9613", name),
    })),
    cover: { name: "Funk_Sampler-9613.jpg", url: archive("Funk_Sampler-9613", "Funk_Sampler-9613.jpg") },
  });
  credit({
    library: "Music",
    work: "Kevin MacLeod, Funk Sampler",
    author: "Kevin MacLeod (incompetech.com)",
    license: "CC BY 3.0",
    licenseUrl: CC_BY_3,
    source: "https://archive.org/details/Funk_Sampler-9613",
    changes: "tags rewritten, track and album ReplayGain added",
  });

  const ed = [
    "The Wires",
    "Typewriter Dance",
    "The Safest Place",
    "Emo Creates",
    "End Title",
    "Teaser Music",
    "Ambience",
  ];
  await album({
    artist: "Jan Morgenstern",
    album: "Elephants Dream (Original Soundtrack)",
    folder: "Elephants Dream (2006)",
    year: 2006,
    genre: "Soundtrack",
    review: "The music of the open movie Elephants Dream.",
    tracks: ed.map((title, i) => ({
      title,
      name: `ED-${i + 1}-${title.replace(/ /g, "")}.mp3`,
      url: blender(`ED/${i + 1}-${title.replace(/ /g, "")}.mp3`),
    })),
    cover: { name: "ED-cover.jpg", url: blender("ED/cover.jpg") },
  });
  credit({
    library: "Music",
    work: "Elephants Dream, original soundtrack (2006)",
    author: "Jan Morgenstern, Orange Open Movie Project",
    license: "CC BY 2.5",
    licenseUrl: "https://creativecommons.org/licenses/by/2.5/",
    source: blender("ED/"),
    changes: "tags rewritten, track and album ReplayGain added",
  });
}

// --- Books -----------------------------------------------------------------------------------

async function cbz(o: {
  out: string;
  pages: string[];
  info: Parameters<typeof comicInfo>[0];
}): Promise<void> {
  await produce(o.out, (tmp) => {
    const work = ensureDir(join(cacheDir, "cbz", basename(o.out, ".cbz")));
    const names = o.pages.map((p, i) => {
      const name = `${String(i + 1).padStart(3, "0")}${extname(p).toLowerCase()}`;
      copyFileSync(p, join(work, name));
      return name;
    });
    writeFileSync(join(work, "ComicInfo.xml"), comicInfo(o.info));
    zipDir(work, ["ComicInfo.xml", ...names], tmp);
  });
}

async function books(): Promise<void> {
  log("Books: Les Misérables");
  const volumes = [
    {
      id: 17489,
      n: 1,
      title: "Fantine",
      text: "Jean Valjean, a former convict, is changed by the kindness of Bishop Myriel; Fantine, abandoned, sacrifices everything for her daughter Cosette.",
    },
    {
      id: 17493,
      n: 2,
      title: "Cosette",
      text: "Jean Valjean takes Cosette away from the Thénardiers and finds refuge with her in the Petit-Picpus convent, still hunted by Javert.",
    },
    {
      id: 17494,
      n: 3,
      title: "Marius",
      text: "Young Marius Pontmercy breaks with his grandfather, discovers poverty and falls in love with Cosette.",
    },
    {
      id: 17518,
      n: 4,
      title: "L'Idylle rue Plumet et l'épopée rue Saint-Denis",
      text: "The romance of Marius and Cosette in the rue Plumet, while Paris rises up in June 1832.",
    },
    {
      id: 17519,
      n: 5,
      title: "Jean Valjean",
      text: "On the barricade, then in the sewers of Paris, Jean Valjean saves Marius; the last face-off with Javert.",
    },
  ];
  for (const t of volumes) {
    // Calibre library layout: one folder per book, metadata.opf next to it.
    const dir = join(
      lib.books,
      "Victor Hugo",
      `Les Misérables, volume ${t.n} - ${t.title.replace(/'/g, "’")} (${t.id})`,
    );
    await fetched(
      join(dir, `Les Misérables, volume ${t.n}.epub`),
      `pg${t.id}-images-3.epub`,
      `https://www.gutenberg.org/cache/epub/${t.id}/pg${t.id}-images-3.epub`,
    );
    writeText(
      join(dir, "metadata.opf"),
      calibreOpf({
        title: t.title,
        author: "Victor Hugo",
        date: "1862-01-01",
        language: "fr",
        publisher: "Project Gutenberg",
        description: t.text,
        series: "Les Misérables",
        index: t.n,
        subjects: ["Fiction", "Classics"],
      }),
    );
  }
  credit({
    library: "Books",
    work: "Victor Hugo, Les Misérables, volumes I to V (1862, French text)",
    author: "Victor Hugo (1802-1885), Project Gutenberg edition",
    license: "Public domain",
    source: "https://www.gutenberg.org/ebooks/17489",
    changes: "laid out as a Calibre library (metadata.opf files written for the purpose)",
  });

  log("Books: Jules Verne");
  const verne = join(lib.books, "Jules Verne");
  await fetched(
    join(verne, "Vingt mille lieues sous les mers.epub"),
    "pg54873-images-3.epub",
    "https://www.gutenberg.org/cache/epub/54873/pg54873-images-3.epub",
  );
  await fetched(
    join(verne, "Around the World in Eighty Days.epub"),
    "jules-verne_around-the-world-in-eighty-days_george-makepeace-towle.epub",
    "https://standardebooks.org/ebooks/jules-verne/around-the-world-in-eighty-days/george-makepeace-towle/downloads/jules-verne_around-the-world-in-eighty-days_george-makepeace-towle.epub?source=download",
  );
  credit({
    library: "Books",
    work: "Jules Verne, Vingt mille lieues sous les mers (illustrated edition, French text)",
    author:
      "Jules Verne (1828-1905), illustrations by Alphonse de Neuville and Édouard Riou, Project Gutenberg edition",
    license: "Public domain",
    source: "https://www.gutenberg.org/ebooks/54873",
  });
  credit({
    library: "Books",
    work: "Jules Verne, Around the World in Eighty Days (translated by George Makepeace Towle)",
    author: "Standard Ebooks",
    license: "CC0 (edition), public domain (text)",
    licenseUrl: CC0,
    source:
      "https://standardebooks.org/ebooks/jules-verne/around-the-world-in-eighty-days/george-makepeace-towle",
  });

  log("Books: Pepper&Carrot");
  const episodes = [
    [1, "ep01_Potion-of-Flight", "La Potion d'envol"],
    [2, "ep02_Rainbow-potions", "Les Potions arc-en-ciel"],
    [3, "ep03_The-secret-ingredients", "Les Ingrédients secrets"],
    [4, "ep04_Stroke-of-genius", "Coup de génie"],
    [5, "ep05_Special-holiday-episode", "Épisode spécial fêtes"],
    [6, "ep06_The-Potion-Contest", "Le Concours de potion"],
  ] as const;
  for (const [n, folder, title] of episodes) {
    const nn = String(n).padStart(2, "0");
    const out = join(lib.books, "Pepper&Carrot", `Pepper&Carrot - ${nn} - ${title.replace(/'/g, "’")}.cbz`);
    if (existsSync(out)) continue;
    const base = `https://www.peppercarrot.com/0_sources/${folder}/low-res/`;
    const listing = await (await fetch(base)).text();
    const names = [
      ...new Set(
        [...listing.matchAll(/href="(fr_Pepper-and-Carrot_by-David-Revoy_E\d\dP\d\d\.jpg)"/g)].map(
          (m) => m[1] ?? "",
        ),
      ),
    ].sort();
    const pages: string[] = [];
    for (const name of names) pages.push(await download(`peppercarrot/${name}`, base + name));
    await cbz({
      out,
      pages,
      info: {
        series: "Pepper&Carrot",
        number: n,
        title,
        summary: `Episode ${n} of the adventures of Pepper, a young witch, and her cat Carrot (French edition).`,
        year: 2014,
        writer: "David Revoy",
        penciller: "David Revoy",
        language: "fr",
        manga: "No",
        pageCount: pages.length,
      },
    });
  }
  credit({
    library: "Books",
    work: "Pepper&Carrot, episodes 1 to 6 (French edition)",
    author: "David Revoy, www.peppercarrot.com",
    license: "CC BY 4.0",
    licenseUrl: CC_BY_4,
    source: "https://www.peppercarrot.com",
    changes: "pages combined into a CBZ with a ComicInfo.xml",
  });

  log("Books: Hokusai Manga");
  const hokusai = join(lib.books, "Hokusai Manga");
  const v5 = join(hokusai, "Hokusai Manga - 05.cbz");
  if (!existsSync(v5)) {
    const tarFile = await download(
      "hokusaimanga05kats_orig_jp2.tar",
      archive("hokusaimanga05kats", "hokusaimanga05kats_orig_jp2.tar"),
    );
    const jp2Dir = join(cacheDir, "hokusaimanga05kats_orig_jp2");
    if (!existsSync(jp2Dir)) extract(tarFile, jp2Dir);
    const jp2 = readdirSync(jp2Dir, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".jp2"))
      .sort()
      .map((f) => join(jp2Dir, f));
    const jpgDir = ensureDir(join(cacheDir, "hokusaimanga05kats_jpg"));
    const pages = jp2.map((f) => {
      const out = join(jpgDir, basename(f).replace(/\.jp2$/, ".jpg"));
      if (!existsSync(out)) ffmpeg(["-i", f, "-vf", "scale=-2:'min(2400,ih)'", "-q:v", "3", out]);
      return out;
    });
    await cbz({
      out: v5,
      pages,
      info: {
        series: "Hokusai Manga",
        number: 5,
        title: "Hokusai Manga, volume 5",
        summary:
          "Fifth volume of Hokusai's sketchbooks: figures, animals, landscapes and scenes of life in Japan. Reads right to left.",
        year: 1816,
        writer: "Katsushika Hokusai",
        penciller: "Katsushika Hokusai",
        language: "ja",
        manga: "YesAndRightToLeft",
        pageCount: pages.length,
      },
    });
  }
  await fetched(
    join(hokusai, "Hokusai Manga - 14.pdf"),
    "hokusaimanga14kats.pdf",
    archive("hokusaimanga14kats", "hokusaimanga14kats.pdf"),
  );
  credit({
    library: "Books",
    work: "Hokusai Manga, volumes 5 and 14",
    author: "Katsushika Hokusai (1760-1849), digitized by the Harold B. Lee Library",
    license: "Public domain",
    source: "https://archive.org/details/hokusaimanga05kats",
    changes: "volume 5: JPEG 2000 images converted to JPEG and combined into a CBZ (read right to left)",
  });

  log("Books: Little Nemo");
  const nemoOut = join(lib.books, "Little Nemo", "Little Nemo in Slumberland (1905).pdf");
  if (!existsSync(nemoOut)) {
    const titles = await selection("books/little-nemo", async () => {
      const pages: string[] = [];
      for (const year of [1905, 1906]) {
        const files = await categoryFiles(
          `Little Nemo in Slumberland, ${year}`,
          (f, _m, mime) =>
            mime === "image/jpeg" &&
            /^File:Little Nemo( in Slumberland)? \(?\d{4}-\d\d-\d\d\)?\.jpe?g$/.test(f.title),
          40,
        );
        pages.push(...files.map((f) => f.title));
      }
      return pages
        .sort((a, b) =>
          (a.match(/\d{4}-\d\d-\d\d/)?.[0] ?? "").localeCompare(b.match(/\d{4}-\d\d-\d\d/)?.[0] ?? ""),
        )
        .slice(0, 24);
    });
    const pages: string[] = [];
    for (const t of titles) {
      const info = await fileInfo(t);
      pages.push(await download(`nemo/${t.slice(5)}`, info.url));
    }
    await produce(nemoOut, (tmp) => jpegsToPdf(pages, tmp, "Little Nemo in Slumberland"));
  }
  credit({
    library: "Books",
    work: "Little Nemo in Slumberland, pages from 1905 and 1906",
    author: "Winsor McCay (1869-1934)",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/Category:Little_Nemo_in_Slumberland",
    changes: "pages combined into a PDF, one JPEG image per page",
  });
}

// --- Photos ----------------------------------------------------------------------------------

async function photos(): Promise<void> {
  const albums: [string, string, number][] = [
    ["Normandy/Rouen", "Quality images of Rouen", 6],
    ["Normandy/Manche", "Quality images of Manche", 5],
    ["Brittany/Finistère", "Quality images of Finistère", 5],
    ["Paris", "Quality images of Paris", 8],
    ["Alps/Chamonix", "Quality images of Chamonix-Mont-Blanc", 6],
  ];
  // Landscapes, monuments, objects: no photos of recognizable people, even under a free license.
  // Commons titles are often French, hence the French words.
  const people =
    /\b(people|person|portrait|selfie|man|men|woman|women|girl|boy|child|kids?|bath|beach|mankini|homme|femme|enfant|baigneur)/i;
  const seen = new Set<string>();
  for (const [album, category, want] of albums) {
    log(`Photos: ${album}`);
    const titles = await selection(`photos/${album}`, async () =>
      (
        await categoryFiles(
          category,
          (f, m, mime) =>
            mime === "image/jpeg" &&
            f.size <= 12e6 &&
            !people.test(f.title) &&
            m.GPSLatitude !== undefined &&
            Boolean(m.Make) &&
            Boolean(m.DateTimeOriginal),
          want,
        )
      ).map((f) => f.title),
    );
    for (const t of titles) {
      if (seen.has(t)) continue;
      seen.add(t);
      const info = await fileInfo(t);
      const name = t.slice(5).replace(/[<>:"/\\|?*]/g, "");
      const out = join(lib.photos, album, name);
      await fetched(out, `photos/${name}`, info.url);
      credit({
        library: "Photos",
        work: `${album}: ${name}`,
        author: info.artist,
        license: info.license,
        source: info.descriptionUrl,
      });
    }
  }
  // Formats without EXIF: the date will be the file's.
  const paris = (await selection("photos/Paris", async () => [])).slice(0, 2);
  const formats = [
    ["png", ["-vf", "scale=1600:-2"]],
    ["webp", ["-vf", "scale=1600:-2", "-c:v", "libwebp", "-quality", "80"]],
  ] as const;
  for (const [i, [ext, args]] of formats.entries()) {
    const t = paris[i];
    if (!t) continue;
    const src = join(lib.photos, "Paris", t.slice(5).replace(/[<>:"/\\|?*]/g, ""));
    await produce(join(lib.photos, "Misc", `${basename(src, extname(src))}.${ext}`), (tmp) =>
      ffmpeg(["-i", src, "-map_metadata", "-1", ...args, tmp]),
    );
  }
}

// --- Attributions ----------------------------------------------------------------------------

function attributions(): void {
  const byLibrary = new Map<string, Credit[]>();
  for (const c of credits) byLibrary.set(c.library, [...(byLibrary.get(c.library) ?? []), c]);
  const lines = [
    "# Attributions of the sample libraries",
    "",
    "Free works used to develop and test Laterna (public domain, CC0, CC BY, CC BY-SA). Generated by `pnpm samples` (devtools/samples).",
    "",
  ];
  for (const [library, list] of byLibrary) {
    lines.push(`## ${library}`, "");
    for (const c of list) {
      const license = c.licenseUrl ? `[${c.license}](${c.licenseUrl})` : c.license;
      lines.push(
        `- **${c.work}** - ${c.author} - ${license} - <${c.source}>${c.changes ? ` - changes: ${c.changes}` : ""}`,
      );
    }
    lines.push("");
  }
  const text = lines.join("\n");
  writeText(join(root, "ATTRIBUTIONS.md"), text);
  writeText(join(import.meta.dirname, "ATTRIBUTIONS.md"), text);
}

// --- Run -------------------------------------------------------------------------------------

const steps: Record<string, () => Promise<void>> = { movies, shows, anime, music, books, photos };
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const name of wanted) if (!steps[name]) throw new Error(`unknown library: ${name}`);
execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); // FFmpeg is required
ensureDir(root);
log(`Sample libraries in ${root}`);
for (const [name, step] of Object.entries(steps)) {
  if (wanted.length === 0 || wanted.includes(name)) await step();
}
if (wanted.length === 0) {
  attributions();
  // Everything is in place: the cache (archives, sources, extracts) would only serve to rebuild a
  // deleted file, which is then downloaded again. --keep-cache keeps it.
  if (!process.argv.includes("--keep-cache")) {
    rmSync(cacheDir, { recursive: true, force: true });
    log("Source cache cleared.");
  }
}
log("Done.");
