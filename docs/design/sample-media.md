# Sample media

The client is developed and tested against a real server filled with real media: movies, shows,
anime, music, books and photos, with subtitles. The server's synthetic fixtures cover edge cases
but do not look like a real library. We need works that anyone may use and share, and a server
that fills up with one command.

## Free works only

Only works that are free in France, where the project started: public domain (authors dead for
more than 70 years; for a film, the last of the director, writers and composer), CC0, CC BY,
CC BY-SA. Never NC or ND. Each work is credited in
[`devtools/samples/ATTRIBUTIONS.md`](../../devtools/samples/ATTRIBUTIONS.md) with its author,
license, source and changes.

Silent films have their sound track removed: the copies that circulate come with music added
later, of uncertain status. This also tests video without audio.

Some works keep their original language (Les Misérables and a Jules Verne novel in French, the
French edition of the Pepper&Carrot comic): they are content, and they exercise the readers with
another language. The metadata written for them (overviews, credits) is in English.

## Metadata is written next to the media

The server only reads NFO files and local images (server: docs/design/metadata.md). The script
writes NFO files (with overviews written for the purpose), `ComicInfo.xml` and Calibre's
`metadata.opf`; posters, backdrops and thumbnails are taken from frames of the videos.

## Tools

In `devtools/samples`:

- `pnpm samples [library]` downloads each source once into `~/laterna-samples/.sources` (resumed,
  SHA-256 recorded in `sources.lock.json`, which is committed: a file changed at the source is
  refused), then lays the media out with names the server understands in
  `~/laterna-samples/{movies,shows,anime,music,books,photos}` (`LATERNA_SAMPLES` for another root).
  Choices made on Wikimedia Commons (photos, comic pages) are recorded in the same file and reused.
  The download cache is deleted at the end unless `--keep-cache` is given.
- `pnpm seed` sets up a new server through the API with the generated client: administrator
  account, test account and kid profile, libraries, a scan awaited through the event stream.
  Credentials are generated and kept in `.dev/seed.json` (not committed).
- `pnpm seed:activity` simulates some use of the main profile: started movies, watched episodes,
  books in progress, a played album, a hand-made collection and a playlist.
- `pnpm party:bot <code>` is a second member for a watch party.

## What it covers

External subtitles (in the same folder and in `Subs/<video>/`), embedded SRT in six languages,
styled ASS with an attached font; two audio tracks; VP8, VP9, H.264, MOV, WebM; collections from
NFO files; shows with missing episodes; named chapters for intro and credits; albums with and
without a cover, gaps in track numbers, FLAC, ReplayGain; EPUB books laid out like a Calibre
library, series of volumes, CBZ with ComicInfo, manga read right to left, a scanned PDF (one image
per page) and a document PDF; photos with EXIF, GPS, orientation, nested albums, PNG and WebP
without a date.

## Consequences

- About 5 GB on the development machine, outside the repository; only the script, the hashes and
  the attributions are committed.
- FFmpeg is needed, and `bsdtar` for ZIP archives (built into Windows; `libarchive-tools` on Debian
  and Ubuntu).
- CI does not build the samples: it runs the unit tests only.
