import { decode } from "blurhash";
import { type CSSProperties, useState } from "react";
import { imageSrcSet, imageUrl } from "../api/media";
import type { Image } from "../gen/laterna/v1/catalog_pb";
import type { Universe } from "../theme/contract";
import styles from "./Artwork.module.css";

const placeholders = new Map<string, string>();

/** Blurred preview of an image (blurhash), decoded once into a small image. */
function placeholder(hash: string): string | undefined {
  if (!hash || typeof document === "undefined") return undefined;
  const known = placeholders.get(hash);
  if (known) return known;
  try {
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const data = ctx.createImageData(size, size);
    data.data.set(decode(hash, size, size));
    ctx.putImageData(data, 0, 0);
    const url = canvas.toDataURL();
    placeholders.set(hash, url);
    return url;
  } catch {
    return undefined;
  }
}

export interface ArtworkProps {
  image: Image | undefined;
  /** Displayed width, to pick the right version (sizes attribute). */
  sizes: string;
  /** Width / height ratio reserved before loading. */
  ratio: number;
  /** Universe color when the item has no image. */
  universe: Universe;
  /** Text shown instead of a missing image (title). */
  fallback?: string;
  /** Shape from the theme: poster, book cover, photo, record sleeve, thumbnail, round (artist). */
  shape?: "poster" | "cover" | "photo" | "disc" | "card" | "round";
  className?: string;
}

/**
 * Catalog image: space reserved at the right proportions, blurred preview while loading, a resized
 * version fit for the screen. Decorative: the title is always written next to it.
 */
export function Artwork({
  image,
  sizes,
  ratio,
  universe,
  fallback,
  shape = "card",
  className,
}: ArtworkProps) {
  const [loaded, setLoaded] = useState(false);
  const blur = image ? placeholder(image.blurhash) : undefined;
  const style: CSSProperties = {
    aspectRatio: String(ratio),
    backgroundColor: `var(--color-${universe}-soft)`,
    ...(blur ? { backgroundImage: `url(${blur})` } : {}),
  };
  return (
    <span
      className={[styles.artwork, styles[shape], className].filter(Boolean).join(" ")}
      style={style}
      data-ui="artwork"
      data-shape={shape}
    >
      {image ? (
        <img
          className={styles.img}
          data-loaded={loaded}
          src={imageUrl(image, 480)}
          srcSet={imageSrcSet(image)}
          sizes={sizes}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      ) : (
        fallback && (
          <span className={styles.fallback} style={{ color: `var(--color-${universe}-text)` }}>
            {fallback}
          </span>
        )
      )}
    </span>
  );
}
