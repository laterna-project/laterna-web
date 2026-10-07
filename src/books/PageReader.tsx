import { Link, type LinkProps } from "@tanstack/react-router";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { imageWidthFor, mediaUrl } from "../api/media";
import type { ReadingProgress } from "../gen/laterna/v1/catalog_pb";
import i18n from "../i18n";
import { barColor } from "../theme/theme";
import { Icon } from "../ui/Icon";
import { type PageMode, type PageSize, pageProgression, percent, spreadOf, spreads } from "./logic";
import type { PdfBook } from "./pdf";
import styles from "./reader.module.css";
import { loadPages, type PageSettings, savePages } from "./settings";
import { useProgress } from "./useProgress";

/** Where the pages come from: images prepared by the server, or a PDF drawn here. */
export type PageSource =
  | { kind: "images"; sizes: readonly PageSize[]; prefix: string }
  | { kind: "pdf"; fileUrl: string };

export interface PageReaderProps {
  bookId: string;
  title: string;
  subtitle: string;
  rightToLeft: boolean;
  source: PageSource;
  progress: ReadingProgress | undefined;
  back: LinkProps;
  /** Next volume of the series, offered on the last spread. */
  next?: { title: string; link: LinkProps };
}

const modes = [
  { id: "single", label: "books.modes.single" },
  { id: "double", label: "books.modes.double" },
  { id: "scroll", label: "books.modes.scroll" },
] as const satisfies readonly { id: PageMode; label: string }[];

/** Page reader: comics, manga, PDF. */
export function PageReader(p: PageReaderProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PageSettings>(loadPages);
  const [pdf, setPdf] = useState<PdfBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const save = useProgress(p.bookId);

  const sizes = p.source.kind === "images" ? p.source.sizes : (pdf?.sizes ?? []);
  const count = sizes.length;
  const list = useMemo(() => spreads(sizes, settings.mode), [sizes, settings.mode]);
  // Spread shown; -1 until the pages are laid out.
  const [index, setIndex] = useState(-1);
  // Page to keep in view: the saved page, then the first page shown (a change of mode keeps it).
  const startPage = useRef(p.progress?.page ?? 0);
  // Last page saved: reopening a book does not rewrite its position.
  const saved = useRef(p.progress?.page ?? -1);
  // Scrolling: the most visible page.
  const [scrolled, setScrolled] = useState(p.progress?.page ?? 0);

  // The bars of the browser and of the installed app around the dark stage.
  useEffect(() => barColor("--color-stage"), []);

  // PDF: opened by pdf.js.
  const pdfUrl = p.source.kind === "pdf" ? p.source.fileUrl : null;
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    let opened: PdfBook | null = null;
    // pdf.js is only loaded for a fixed-layout PDF.
    import("./pdf")
      .then(({ openPdf }) => openPdf(mediaUrl(pdfUrl)))
      .then((b) => {
        opened = b;
        if (cancelled) void b.close();
        else setPdf(b);
      })
      .catch(() => !cancelled && setError(i18n.t("books.cantOpenPdf")));
    return () => {
      cancelled = true;
      void opened?.close();
    };
  }, [pdfUrl]);

  // Resuming: the spread of the saved page, once the pages are known; a change of mode keeps the
  // page shown.
  useEffect(() => {
    if (list.length > 0) setIndex(spreadOf(list, startPage.current));
  }, [list]);

  const spread = list[index] ?? [];
  const last = spread[spread.length - 1] ?? 0;
  useEffect(() => {
    if (index < 0 || count === 0 || settings.mode === "scroll") return;
    startPage.current = spread[0] ?? 0;
    if (last === saved.current) return;
    saved.current = last;
    save({ page: last, progression: pageProgression(last, count) });
  }, [index, spread, last, count, save, settings.mode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the pages area changes element with the mode.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setBox({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.mode]);

  const update = (patch: Partial<PageSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      savePages(next);
      return next;
    });

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(Math.max(0, i + delta), list.length - 1)),
    [list],
  );
  // Left and right follow the reading direction: in manga, left goes forward.
  const left = useCallback(() => go(p.rightToLeft ? 1 : -1), [go, p.rightToLeft]);
  const right = useCallback(() => go(p.rightToLeft ? -1 : 1), [go, p.rightToLeft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || settings.mode === "scroll") return;
      if ((e.target as HTMLElement | null)?.closest("input, select")) return;
      if (e.key === "ArrowLeft") left();
      else if (e.key === "ArrowRight") right();
      else if (e.key === " " || e.key === "PageDown") go(1);
      else if (e.key === "PageUp") go(-1);
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(list.length - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, left, right, list.length, settings.mode]);

  // Size of a page on screen: fit to the height, or to the shared width.
  const fitted = (n: number) => {
    const s = sizes[n];
    if (!s || box.width === 0) return { width: 0, height: 0 };
    const share = box.width / Math.max(1, spread.length);
    const byHeight = settings.fit === "height" && settings.mode !== "scroll";
    const width = byHeight ? Math.min(share, (box.height * s.width) / s.height) : Math.min(share, 1100);
    return { width, height: (width * s.height) / s.width };
  };

  const scroll = settings.mode === "scroll";
  // Reference page: the last of the spread, or the most visible page when scrolling.
  const current = scroll ? scrolled : last;
  const progression = count > 0 ? pageProgression(current, count) : (p.progress?.progression ?? 0);
  const atEnd = count > 0 && (scroll ? current === count - 1 : index === list.length - 1);
  const where =
    count === 0
      ? ""
      : !scroll && spread.length > 1
        ? t("books.pagesOf", { a: (spread[0] ?? 0) + 1, b: (spread[1] ?? 0) + 1, count })
        : t("books.pageOf", { page: current + 1, count });

  return (
    <main className={styles.stage} data-ui="reader" data-kind="pages">
      <header className={styles.stageHead} data-ui="reader-top">
        <Link {...p.back} className={styles.dark} aria-label={t("books.back")}>
          <Icon name="back" />
        </Link>
        <div className={styles.heading}>
          <h1 className={styles.title}>{p.title}</h1>
          <span className={styles.sub}>{p.subtitle}</span>
        </div>
        <span className={styles.spacer} />
        {p.rightToLeft && (
          <span className={styles.rtl}>
            <Icon name="back" size={16} />
            {t("books.rtl")}
          </span>
        )}
        <fieldset className={styles.modes}>
          <legend className="sr-only">{t("books.pageDisplay")}</legend>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={styles.mode}
              aria-pressed={settings.mode === m.id}
              onClick={() => update({ mode: m.id })}
            >
              {t(m.label)}
            </button>
          ))}
        </fieldset>
        {settings.mode !== "scroll" && (
          <button
            type="button"
            className={styles.fit}
            onClick={() => update({ fit: settings.fit === "height" ? "width" : "height" })}
          >
            <span className={styles.fitLabel}>{t("books.fit")}</span>
            {settings.fit === "height" ? t("books.fitHeight") : t("books.fitWidth")}
          </button>
        )}
      </header>

      {settings.mode === "scroll" ? (
        <ScrollPages
          areaRef={area}
          sizes={sizes}
          source={p.source}
          pdf={pdf}
          box={box}
          start={startPage.current}
          onPage={(n) => {
            startPage.current = n;
            setScrolled(n);
            if (n === saved.current) return;
            saved.current = n;
            save({ page: n, progression: pageProgression(n, count) });
          }}
        />
      ) : (
        <div className={styles.spreadArea}>
          <button
            type="button"
            className={styles.side}
            onClick={left}
            aria-label={p.rightToLeft ? t("books.nextPage") : t("books.previousPage")}
          >
            <Icon name="back" />
          </button>
          <div
            ref={area}
            className={styles.spread}
            data-fit={settings.fit}
            data-rtl={p.rightToLeft}
            aria-live="polite"
          >
            {error && <p className={styles.error}>{error}</p>}
            {spread.map((n) => (
              <Page key={n} n={n} size={fitted(n)} source={p.source} pdf={pdf} />
            ))}
          </div>
          <button
            type="button"
            className={styles.side}
            onClick={right}
            aria-label={p.rightToLeft ? t("books.previousPage") : t("books.nextPage")}
          >
            <Icon name="chevron" />
          </button>
          <Preload source={p.source} pages={list[index + 1] ?? []} width={fitted(spread[0] ?? 0).width} />
        </div>
      )}

      <footer className={styles.stageFoot}>
        <span className={styles.percent}>{percent(progression)}</span>
        <span className={styles.track} data-rtl={p.rightToLeft}>
          <span className={styles.fill} style={{ width: `${progression * 100}%` }} />
          {settings.mode !== "scroll" && (
            <input
              type="range"
              min={0}
              max={Math.max(0, list.length - 1)}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              aria-label={t("books.spreadLabel")}
              aria-valuetext={where}
            />
          )}
        </span>
        <span className={styles.where}>{where}</span>
        {atEnd && p.next && (
          <Link {...p.next.link} className={styles.nextBook}>
            {p.next.title} →
          </Link>
        )}
      </footer>
    </main>
  );
}

function imageSrc(source: PageSource, n: number, width: number): string {
  return source.kind === "images"
    ? `${mediaUrl(`${source.prefix}${n}`)}?w=${imageWidthFor(width, window.devicePixelRatio)}`
    : "";
}

function Page({
  n,
  size,
  source,
  pdf,
}: {
  n: number;
  size: { width: number; height: number };
  source: PageSource;
  pdf: PdfBook | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = Math.round(size.width);
  useEffect(() => {
    if (source.kind !== "pdf" || !pdf || !canvas.current || width === 0) return;
    const el = canvas.current;
    void import("./pdf").then(({ renderPdfPage }) => renderPdfPage(pdf, n, el, width)).catch(() => {});
  }, [source.kind, pdf, n, width]);
  if (width === 0) return null;
  const style = { width: `${size.width}px`, height: `${size.height}px` };
  return source.kind === "images" ? (
    <img className={styles.page} src={imageSrc(source, n, size.width)} alt={`Page ${n + 1}`} style={style} />
  ) : (
    <canvas ref={canvas} className={styles.page} style={style} aria-label={`Page ${n + 1}`} role="img" />
  );
}

/** Preloads the images of the next spread. */
function Preload({ source, pages, width }: { source: PageSource; pages: readonly number[]; width: number }) {
  useEffect(() => {
    if (source.kind !== "images" || width === 0) return;
    for (const n of pages) new Image().src = imageSrc(source, n, width);
  }, [source, pages, width]);
  return null;
}

/** Scrolling: every page in a row; the most visible page is the current one. */
function ScrollPages({
  areaRef,
  sizes,
  source,
  pdf,
  box,
  start,
  onPage,
}: {
  areaRef: RefObject<HTMLDivElement | null>;
  sizes: readonly PageSize[];
  source: PageSource;
  pdf: PdfBook | null;
  box: { width: number; height: number };
  start: number;
  onPage: (n: number) => void;
}) {
  const width = Math.min(box.width, 1000);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  const placed = useRef(false);

  useEffect(() => {
    const root = areaRef.current;
    if (!root || width === 0) return;
    if (!placed.current) {
      root.querySelector(`[data-page="${start}"]`)?.scrollIntoView();
      placed.current = true;
    }
    const seen = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          seen.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio);
        const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) onPageRef.current(best[0]);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of Array.from(root.querySelectorAll("[data-page]"))) io.observe(el);
    return () => io.disconnect();
  }, [areaRef, width, start]);

  return (
    <div ref={areaRef} className={styles.scroll}>
      {sizes.map((s, n) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a page is its number.
          key={n}
          data-page={n}
          className={styles.scrollPage}
          style={{ width: `${width}px`, aspectRatio: `${s.width} / ${s.height}` }}
        >
          {width > 0 && (
            <LazyPage n={n} source={source} pdf={pdf} width={width} height={(width * s.height) / s.width} />
          )}
        </div>
      ))}
    </div>
  );
}

function LazyPage({
  n,
  source,
  pdf,
  width,
  height,
}: {
  n: number;
  source: PageSource;
  pdf: PdfBook | null;
  width: number;
  height: number;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), {
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <span ref={holder} className={styles.lazy}>
      {visible && <Page n={n} size={{ width, height }} source={source} pdf={pdf} />}
    </span>
  );
}
