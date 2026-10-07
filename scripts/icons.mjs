// Favicons and icons of the installed app (public/): the four dots of the logo (src/ui/Logo.tsx) on
// a dark tile. Every size is drawn here from the same shapes, so they never drift apart; run again
// after a change ("pnpm icons") and commit the files. No dependency: each pixel is sampled 4 × 4
// times, then written as PNG, and as ICO for the old favicon.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

const out = join(import.meta.dirname, "..", "public");

// Colors of the default theme (src/theme/themes/universe.css): its ink for the tile, then the
// logo's universes in its order (movies, series, music, collections).
const tile = "#14151a";
const dots = ["#ff7a45", "#5b4bdb", "#1fb57a", "#ffc83d"];

// Shapes on a 1 × 1 square. The dots keep the logo's proportions (14 px dots, 4 px apart) and stay
// inside the safe zone of maskable icons (a circle of radius 0.4). Favicons get bigger dots: they
// are shown at 16 px.
const iconDot = 0.23;
const faviconDot = 0.28;

/** Centers of the four dots, for a dot diameter. */
function centers(diameter) {
  const offset = (diameter + (diameter * 4) / 14) / 2;
  return [
    [0.5 - offset, 0.5 - offset],
    [0.5 + offset, 0.5 - offset],
    [0.5 - offset, 0.5 + offset],
    [0.5 + offset, 0.5 + offset],
  ];
}
// Corner radius of the tile, as on a phone's home screen; 0 for a square that the system masks
// (Android's maskable icons, iOS's touch icon).
const roundedCorner = 0.225;

function rgb(hex) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

function inTile(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

/** Color at a point of the unit square, or null outside the tile. */
function colorAt(x, y, radius, diameter) {
  const r = diameter / 2;
  for (const [i, [cx, cy]] of centers(diameter).entries()) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return rgb(dots[i]);
  }
  return inTile(x, y, radius) ? rgb(tile) : null;
}

/** RGBA pixels of the icon at a size. */
function draw(size, radius, diameter) {
  const samples = 4;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const c = colorAt(x, (py + (sy + 0.5) / samples) / size, radius, diameter);
          if (c === null) continue;
          covered++;
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      }
      const at = (py * size + px) * 4;
      if (covered === 0) continue;
      for (let k = 0; k < 3; k++) pixels[at + k] = Math.round(sum[k] / covered);
      pixels[at + 3] = Math.round((covered / (samples * samples)) * 255);
    }
  }
  return pixels;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(size, radius, diameter = iconDot) {
  const pixels = draw(size, radius, diameter);
  // Each row starts with its filter type (0: none).
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO file holding PNG images, one per size. */
function ico(sizes) {
  const images = sizes.map((s) => png(s, roundedCorner, faviconDot));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (const [i, s] of sizes.entries()) {
    const entry = 6 + 16 * i;
    header.writeUInt8(s, entry);
    header.writeUInt8(s, entry + 1);
    header.writeUInt16LE(1, entry + 4); // color planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(images[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  }
  return Buffer.concat([header, ...images]);
}

function svg() {
  const n = (v) => Number((v * 512).toFixed(2));
  const circles = centers(faviconDot).map(
    ([cx, cy], i) => `  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(faviconDot / 2)}" fill="${dots[i]}"/>`,
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`,
    "  <title>Laterna</title>",
    `  <rect width="512" height="512" rx="${n(roundedCorner)}" fill="${tile}"/>`,
    ...circles,
    "</svg>",
    "",
  ].join("\n");
}

const files = {
  // Browser tabs: the SVG where it is understood, the ICO elsewhere.
  "favicon.svg": svg(),
  "favicon.ico": ico([16, 32, 48]),
  // Home screen of iPhones and iPads: a square, rounded by the system.
  "apple-touch-icon.png": png(180, 0),
  // Installed app (public/manifest.json): Windows, Linux, macOS, ChromeOS, then Android's mask.
  "icon-192.png": png(192, roundedCorner),
  "icon-512.png": png(512, roundedCorner),
  "icon-maskable-512.png": png(512, 0),
};
for (const [name, content] of Object.entries(files)) writeFileSync(join(out, name), content);
console.log(`${Object.keys(files).length} icons written to public/`);
