import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageKind, pickImage } from "../../api/media";
import type { PhotoSummary } from "../../gen/laterna/v1/catalog_pb";
import type { PhotoContext } from "../../photos/context";
import { justify } from "../../photos/logic";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import styles from "./photos.module.css";

const gap = 6;

export interface Selection {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
}

/** Width of an element, tracked. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Photos in justified rows: the same height in a row, the width filled. While a selection is in
 * progress, a click selects the photo instead of opening it.
 */
export function JustifiedGrid({
  photos,
  context,
  selection,
  target = 220,
}: {
  photos: readonly PhotoSummary[];
  context: PhotoContext;
  selection?: Selection;
  target?: number;
}) {
  const { t } = useTranslation();
  const [ref, width] = useWidth<HTMLDivElement>();
  const ratios = photos.map((p) => (p.width > 0 && p.height > 0 ? p.width / p.height : 1.5));
  const rows = justify(ratios, width, Math.min(target, width / 1.6 || target), gap);
  const selecting = Boolean(selection && selection.ids.size > 0);

  return (
    <div ref={ref} className={styles.grid} data-ui="photo-grid">
      {rows.map((r) => (
        <div key={r.start} className={styles.row} style={{ height: `${r.height}px` }}>
          {photos.slice(r.start, r.end).map((p, k) => {
            const w = r.height * (ratios[r.start + k] ?? 1.5);
            const on = selection?.ids.has(p.id) ?? false;
            return (
              <div
                key={p.id}
                className={styles.tile}
                style={{ width: `${w}px` }}
                data-selected={on}
                data-ui="card"
                data-kind="photo"
                data-universe="photos"
              >
                <Link
                  to="/play/photo/$id"
                  params={{ id: p.id }}
                  search={context}
                  className={styles.tileLink}
                  aria-label={p.title}
                  onClick={(e) => {
                    if (!selecting || !selection) return;
                    e.preventDefault();
                    selection.toggle(p.id);
                  }}
                >
                  <Artwork
                    image={pickImage(p.images, ImageKind.PHOTO)}
                    sizes={`${Math.ceil(w)}px`}
                    ratio={ratios[r.start + k] ?? 1.5}
                    universe="photos"
                    shape="photo"
                  />
                </Link>
                {selection && (
                  <button
                    type="button"
                    className={styles.check}
                    aria-pressed={on}
                    aria-label={
                      on ? t("photos.unselect", { title: p.title }) : t("photos.select", { title: p.title })
                    }
                    onClick={() => selection.toggle(p.id)}
                  >
                    <Icon name="check" size={13} />
                  </button>
                )}
                {p.userData?.favorite && (
                  <span className={styles.favorite} role="img" aria-label={t("catalog.favorite")}>
                    <Icon name="heart" size={12} filled />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
