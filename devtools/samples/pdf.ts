// "Scanned" PDF: one JPEG image per page, at its proportions, as is (DCTDecode), exactly what the
// server reads as pages (BOOK_LAYOUT_IMAGES, server: docs/design/media-types.md).
import { readFileSync, writeFileSync } from "node:fs";

/** Width, height and number of components of a JPEG, read from its SOF header. */
function jpegInfo(data: Buffer): { width: number; height: number; components: number } {
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) throw new Error("JPEG illisible");
    const marker = data[i + 1] ?? 0;
    const length = data.readUInt16BE(i + 2);
    // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: data.readUInt16BE(i + 5),
        width: data.readUInt16BE(i + 7),
        components: data[i + 9] ?? 3,
      };
    }
    i += 2 + length;
  }
  throw new Error("JPEG without a dimensions header");
}

export function jpegsToPdf(pages: string[], out: string, title: string): void {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    chunks.push(buf);
    size += buf.length;
  };
  const object = (n: number, body: () => void) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  // 1 catalog, 2 page tree, 3 info; then per page: page, image, content.
  const pageRefs = pages.map((_, i) => `${4 + i * 3} 0 R`).join(" ");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => push(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`));
  const latin = title.replace(/[()\\]/g, "");
  object(3, () => push(`<< /Title (${latin}) /Producer (laterna-web devtools) >>`));
  pages.forEach((file, i) => {
    const data = readFileSync(file);
    const { width, height, components } = jpegInfo(data);
    const page = 4 + i * 3;
    const color = components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    object(page, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`,
      ),
    );
    object(page + 1, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${color} /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`,
      );
      push(data);
      push("\nendstream");
    });
    object(page + 2, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  });

  const count = 4 + pages.length * 3;
  const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  writeFileSync(out, Buffer.concat(chunks));
}
