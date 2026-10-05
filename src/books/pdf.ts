// Fixed-layout PDF (BOOK_LAYOUT_DOCUMENT): pdf.js reads the file in chunks (the server accepts
// Range requests) and draws each page at the displayed size.
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageSize } from "./logic";

GlobalWorkerOptions.workerSrc = worker;

export interface PdfBook {
  doc: PDFDocumentProxy;
  sizes: PageSize[];
  /** Closes the document and its worker. */
  close: () => Promise<void>;
}

export async function openPdf(url: string): Promise<PdfBook> {
  // pdf.js support files, served by the app (devtools/vite/pdfjs-assets.ts).
  const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
  const task = getDocument({
    url,
    disableAutoFetch: true,
    wasmUrl: `${assets}wasm/`,
    cMapUrl: `${assets}cmaps/`,
    standardFontDataUrl: `${assets}standard_fonts/`,
  });
  const doc = await task.promise;
  const sizes = await Promise.all(
    Array.from({ length: doc.numPages }, async (_, i) => {
      const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    }),
  );
  return { doc, sizes, close: () => task.destroy() };
}

/** Draws page n (from 0) for a displayed width, at the screen's pixel density. */
export async function renderPdfPage(
  book: PdfBook,
  n: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<void> {
  const page = await book.doc.getPage(n + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = (cssWidth / base.width) * Math.min(2, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport }).promise;
}
