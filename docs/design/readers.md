# Readers

The server says how each book file reads (`BookLayout`):

- **as images** (CBZ, scanned PDF): it serves each page at the requested width; the client has
  nothing to decode;
- **as reflowable text** (EPUB): the client lays out the book itself, from the whole file;
- **as a document** (fixed-layout PDF): the client draws the pages, from the file (the server
  accepts Range requests).

The position is saved per page for the first two, and as an EPUB CFI for text
(`SaveReadingProgress`).

## EPUB: foliate-js

[foliate-js](https://github.com/johnfactotum/foliate-js), the engine of the Foliate reader (MIT,
no runtime dependency): pagination in one or two columns, CFI, table of contents, section
fractions (the marks on the progress bar), styles applied to each chapter. The `foliate-js`
package on npm is a republication by someone else, so the author's repository is installed,
**pinned to a commit** (`github:johnfactotum/foliate-js#<commit>`). It only loads when an EPUB
opens. Updating it means changing the pinned commit after reading the changes.

The other formats foliate-js reads (MOBI, FB2) are not offered: the server does not serve them.

## PDF: pdf.js

[pdfjs-dist](https://github.com/mozilla/pdf.js) (Mozilla, Apache-2.0) draws fixed-layout PDF pages
one by one inside the page reader, which also shows CBZ pages. Its support files (WebAssembly
decoders for JPEG 2000 and JBIG2, which the Internet Archive's scanned PDFs are full of, CMaps,
standard fonts) are served under `/pdfjs/` by a small Vite plugin (`devtools/vite/pdfjs-assets.ts`)
that copies them as they are into the build.

One page reader, two sources (images from the server, a PDF drawn here): single and double page,
scrolling, right-to-left reading and resuming are written once.

## Fonts and paper

Reading fonts are Literata and Atkinson Hyperlegible Next (OFL), served with the app. The app's
`@font-face` rules are copied into each EPUB chapter, with absolute URLs, since those documents do
not have the app's address.

The paper comes from the `--color-paper*` tokens, redefined under `[data-paper="sepia"]` and
`[data-paper="night"]`; the computed colors are passed to the book's text. With a dark style and
nothing saved, the reader opens on the night paper.
