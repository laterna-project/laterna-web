import type { Universe } from "../theme/contract";
import styles from "./Avatar.module.css";

const order: Universe[] = [
  "playlists",
  "music",
  "collections",
  "party",
  "movies",
  "books",
  "photos",
  "series",
];

/**
 * A profile's color from its place among the account's profiles (in creation order): two
 * neighboring profiles never share one. Profiles have no picture.
 */
export function profileUniverse(profileIds: readonly string[], id: string): Universe {
  const index = Math.max(0, profileIds.indexOf(id));
  return order[index % order.length] ?? "playlists";
}

/** Round badge of a profile: its initial on its universe color. */
export function Avatar({
  name,
  universe,
  size = "md",
}: {
  name: string;
  universe: Universe;
  size?: "sm" | "md" | "xl";
}) {
  return (
    <span
      className={`${styles.avatar} ${styles[size]}`}
      data-ui="avatar"
      data-universe={universe}
      style={{ background: `var(--color-${universe})`, color: `var(--color-${universe}-ink)` }}
      aria-hidden="true"
    >
      {Array.from(name.trim())[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
