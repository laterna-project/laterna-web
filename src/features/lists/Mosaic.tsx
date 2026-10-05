import type { Image } from "../../gen/laterna/v1/catalog_pb";
import { Artwork } from "../../ui/Artwork";
import styles from "./lists.module.css";

/** Four images in a square (first entries of a playlist, first movies of a collection). */
export function Mosaic({ images, size }: { images: readonly Image[]; size: "small" | "large" }) {
  const cells = [0, 1, 2, 3].map((i) => images[i]);
  return (
    <span className={styles.mosaic} data-size={size} aria-hidden="true">
      {cells.map((img, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: four fixed cells.
          key={i}
          className={styles.cell}
        >
          {img && (
            <Artwork
              image={img}
              sizes={size === "small" ? "30px" : "120px"}
              ratio={1}
              universe="playlists"
              shape="card"
            />
          )}
        </span>
      ))}
    </span>
  );
}
