import { Link, type LinkProps } from "@tanstack/react-router";
import type { Location, TocItem, View } from "foliate-js/view.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api/media";
import type { ReadingProgress } from "../gen/laterna/v1/catalog_pb";
import i18n from "../i18n";
import { Icon } from "../ui/Icon";
import { usePanelFocus } from "../ui/usePanelFocus";
import { families, fontFaces } from "./fonts";
import { percent } from "./logic";
import styles from "./reader.module.css";
import { fonts, loadText, papers, saveText, type TextSettings, textSizes } from "./settings";
import { useProgress } from "./useProgress";

export interface EpubReaderProps {
  bookId: string;
  title: string;
  subtitle: string;
  fileUrl: string;
  progress: ReadingProgress | undefined;
  back: LinkProps;
  /** Next volume of the series, offered at the end of the book. */
  next?: { title: string; link: LinkProps };
}

/** Style sheet set in each chapter: font, size, line height, paper colors. */
function bookStyles(root: HTMLElement, s: TextSettings): string {
  const css = getComputedStyle(root);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const font = token(fonts.find((f) => f.id === s.font)?.token ?? "--font-reading");
  return `${fontFaces(families(font))}
    html { font-size: ${s.size}px !important; }
    html, body { color: ${token("--color-paper-ink")} !important; background: transparent !important; }
    body { font-family: ${font} !important; }
    p, li, blockquote, dd {
      line-height: ${s.airy ? 1.75 : 1.45} !important;
      text-align: justify;
      hyphens: auto;
      widows: 2;
      orphans: 2;
    }
    a:link, a:visited { color: ${token("--color-books-text")}; }
    img, svg { max-width: 100%; }`;
}

/** EPUB reader: text laid out by foliate-js, the reader's settings. */
export function EpubReader(p: EpubReaderProps) {
  const { t } = useTranslation();
  const stage = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const [settings, setSettings] = useState(loadText);
  const [location, setLocation] = useState<Location | null>(null);
  const [ticks, setTicks] = useState<number[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [panel, setPanel] = useState<"settings" | "toc" | null>(null);
  const panelRef = usePanelFocus<HTMLElement>(panel, () => setPanel(null));
  const [error, setError] = useState<string | null>(null);
  const save = useProgress(p.bookId);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const update = (patch: Partial<TextSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveText(next);
      return next;
    });

  const keys = useCallback((e: KeyboardEvent) => {
    const v = view.current;
    if (!v || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowLeft" || e.key === "PageUp") void v.goLeft();
    else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") void v.goRight();
    else if (e.key === "Escape") setPanel(null);
    else return;
    e.preventDefault();
  }, []);

  // Opening the book at the saved position.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the book only opens once.
  useEffect(() => {
    let cancelled = false;
    const el = holder.current;
    if (!el) return;
    let v: View | null = null;
    (async () => {
      await import("foliate-js/view.js");
      if (cancelled) return;
      v = document.createElement("foliate-view") as View;
      v.className = styles.book ?? "";
      el.append(v);
      view.current = v;
      v.addEventListener("relocate", (e) => {
        const loc = (e as CustomEvent<Location>).detail;
        setLocation(loc);
        save({ locator: loc.cfi, progression: loc.fraction });
      });
      // Keys also work when the text (a separate document) has focus.
      v.addEventListener("load", (e) => {
        (e as CustomEvent<{ doc: Document }>).detail.doc.addEventListener("keydown", keys);
      });
      try {
        await v.open(mediaUrl(p.fileUrl));
        if (cancelled) return;
        applySettings(v, settingsRef.current);
        setToc(v.book.toc ?? []);
        setTicks(v.getSectionFractions());
        const at = p.progress;
        if (at?.locator) await v.init({ lastLocation: at.locator });
        else if (at && at.progression > 0) await v.goToFraction(at.progression);
        else await v.init({ showTextStart: true });
      } catch {
        if (!cancelled) setError(i18n.t("books.cantOpen"));
      }
    })();
    return () => {
      cancelled = true;
      v?.close();
      v?.remove();
      view.current = null;
    };
  }, [p.bookId]);

  const applySettings = useCallback((v: View, s: TextSettings) => {
    const root = stage.current;
    if (!root) return;
    v.renderer.setAttribute("flow", "paginated");
    v.renderer.setAttribute("max-column-count", s.spread ? "2" : "1");
    v.renderer.setAttribute("max-inline-size", "680px");
    v.renderer.setAttribute("gap", "7%");
    v.renderer.setStyles(bookStyles(root, s));
  }, []);

  useEffect(() => {
    // The paper changes the computed colors: wait until the attribute is set.
    if (view.current?.renderer) applySettings(view.current, settings);
  }, [settings, applySettings]);

  useEffect(() => {
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [keys]);

  const fraction = location?.fraction ?? p.progress?.progression ?? 0;
  const chapter = location?.tocItem?.label?.trim();

  return (
    <main ref={stage} className={styles.paper} data-paper={settings.paper} data-ui="reader" data-kind="epub">
      <header className={styles.paperHead} data-ui="reader-top">
        <Link {...p.back} className={styles.chip} aria-label={t("books.back")}>
          <Icon name="back" />
        </Link>
        <div className={styles.heading}>
          <h1 className={styles.title}>{p.title}</h1>
          <span className={styles.sub}>{[p.subtitle, chapter].filter(Boolean).join(" · ")}</span>
        </div>
        <span className={styles.spacer} />
        {toc.length > 0 && (
          <button
            type="button"
            className={styles.pill}
            aria-expanded={panel === "toc"}
            aria-controls="contents"
            onClick={() => setPanel((o) => (o === "toc" ? null : "toc"))}
          >
            {t("books.toc")}
          </button>
        )}
        <button
          type="button"
          className={styles.aa}
          aria-expanded={panel === "settings"}
          aria-controls="playback-settings"
          aria-label={t("books.settings")}
          onClick={() => setPanel((o) => (o === "settings" ? null : "settings"))}
        >
          Aa
        </button>
      </header>

      <div className={styles.paperBody}>
        <button
          type="button"
          className={styles.turn}
          aria-label={t("books.previousPage")}
          onClick={() => void view.current?.goLeft()}
        >
          <Icon name="back" />
        </button>
        <div ref={holder} className={styles.holder}>
          {error && <p className={styles.error}>{error}</p>}
        </div>
        <button
          type="button"
          className={styles.turn}
          aria-label={t("books.nextPage")}
          onClick={() => void view.current?.goRight()}
        >
          <Icon name="chevron" />
        </button>
      </div>

      {panel === "settings" && (
        <aside
          id="playback-settings"
          ref={panelRef}
          className={styles.settings}
          data-ui="reader-panel"
          aria-label={t("books.settings")}
        >
          <p className={styles.settingsTitle}>{t("books.settings")}</p>
          <p className={styles.label}>{t("books.textSize")}</p>
          <div className={styles.size}>
            <span className={styles.smallA}>A</span>
            <input
              type="range"
              min={textSizes.min}
              max={textSizes.max}
              step={1}
              value={settings.size}
              onChange={(e) => update({ size: Number(e.target.value) })}
              aria-label={t("books.textSize")}
            />
            <span className={styles.bigA}>A</span>
          </div>
          <p className={styles.label}>{t("books.font")}</p>
          <div className={styles.fonts}>
            {fonts.map((f) => (
              <button
                key={f.id}
                type="button"
                className={styles.font}
                aria-pressed={settings.font === f.id}
                style={{ fontFamily: `var(${f.token})` }}
                onClick={() => update({ font: f.id })}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
          <p className={styles.label}>{t("books.background")}</p>
          <div className={styles.papers}>
            {papers.map((x) => (
              <button
                key={x.id}
                type="button"
                className={styles.paperChoice}
                aria-pressed={settings.paper === x.id}
                aria-label={t("books.backgroundOf", { name: t(x.label) })}
                onClick={() => update({ paper: x.id })}
              >
                <span className={styles.swatch} data-paper={x.id}>
                  Aa
                </span>
                {t(x.label)}
              </button>
            ))}
          </div>
          <Switch label={t("books.spread")} on={settings.spread} onChange={(spread) => update({ spread })} />
          <Switch label={t("books.airy")} on={settings.airy} onChange={(airy) => update({ airy })} />
        </aside>
      )}

      {panel === "toc" && (
        <aside
          id="contents"
          ref={panelRef}
          className={styles.toc}
          aria-label={t("books.toc")}
          data-ui="reader-panel"
        >
          <p className={styles.settingsTitle}>{t("books.toc")}</p>
          <Toc
            items={toc}
            current={location?.tocItem?.href}
            onGo={(href) => {
              void view.current?.goTo(href);
              setPanel(null);
            }}
          />
        </aside>
      )}

      <footer className={styles.paperFoot}>
        <span className={styles.percent}>{percent(fraction)}</span>
        <span className={styles.track}>
          <span className={styles.fill} style={{ width: `${fraction * 100}%` }} />
          {ticks.slice(1, -1).map((tick) => (
            <span key={tick} className={styles.tick} style={{ left: `${tick * 100}%` }} />
          ))}
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(fraction * 1000)}
            onChange={(e) => void view.current?.goToFraction(Number(e.target.value) / 1000)}
            aria-label={t("books.positionInBook")}
            aria-valuetext={percent(fraction)}
          />
        </span>
        <span className={styles.where}>
          {chapter ? `${chapter} · ` : ""}
          {t("books.syncNote")}
        </span>
        {fraction >= 0.995 && p.next && (
          <Link {...p.next.link} className={styles.nextBook}>
            {p.next.title} →
          </Link>
        )}
      </footer>
    </main>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={styles.switchRow}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={styles.switch}
        onClick={() => onChange(!on)}
      >
        <span />
      </button>
    </div>
  );
}

function Toc({
  items,
  current,
  onGo,
}: {
  items: readonly TocItem[];
  current: string | undefined;
  onGo: (href: string) => void;
}) {
  return (
    <ol className={styles.tocList}>
      {items.map((t) => (
        <li key={t.href}>
          <button
            type="button"
            className={styles.tocItem}
            aria-current={t.href === current ? "true" : undefined}
            onClick={() => onGo(t.href)}
          >
            {t.label.trim()}
          </button>
          {t.subitems && t.subitems.length > 0 && <Toc items={t.subitems} current={current} onGo={onGo} />}
        </li>
      ))}
    </ol>
  );
}
