import type { CSSProperties } from "react";
import type { Universe } from "./contract";

/**
 * Block in a universe's colors (banner, header, large card). The share of the color comes from the
 * theme (--universe-fill): a pale tint in "Universe", a barely tinted plate in "Magic lantern"; the
 * text moves towards the theme's ink by as much. Small elements (badges, play buttons) keep the
 * full color: var(--color-<universe>).
 */
export function universeBlock(universe: Universe): CSSProperties {
  return {
    background: `color-mix(in srgb, var(--color-${universe}) var(--universe-fill), var(--color-surface))`,
    color: `color-mix(in srgb, var(--color-${universe}-ink) var(--universe-fill), var(--color-ink))`,
  };
}
