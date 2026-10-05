/** Line icons, drawn on a 24 × 24 grid, in the text color. */
const paths = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </>
  ),
  sort: (
    <>
      <path d="M7 4v16" />
      <path d="M3 16l4 4 4-4" />
      <path d="M17 20V4" />
      <path d="M13 8l4-4 4 4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.3c2.1.7 3.5 2.8 3.5 5.7" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  back: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M16 9.5l5 5" />
      <path d="M21 9.5l-5 5" />
    </>
  ),
  expand: (
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>
  ),
  shrink: (
    <>
      <path d="M9 4v5H4" />
      <path d="M15 4v5h5" />
      <path d="M9 20v-5H4" />
      <path d="M15 20v-5h5" />
    </>
  ),
  subtitles: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M7 12.5h4" />
      <path d="M13 12.5h4" />
      <path d="M7 15.5h10" />
    </>
  ),
  replay: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 3.5v3.7h3.7" />
    </>
  ),
  forward: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 3.5v3.7h-3.7" />
    </>
  ),
  skipBack: (
    <>
      <path d="M18 5v14L8 12z" fill="currentColor" stroke="none" />
      <rect x="5" y="5" width="2.2" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  skipForward: (
    <>
      <path d="M6 5v14l10-7z" fill="currentColor" stroke="none" />
      <rect x="16.8" y="5" width="2.2" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  // Skip a segment (intro, recap): two triangles.
  skip: (
    <>
      <path d="M4 5v14l9-7z" fill="currentColor" stroke="none" />
      <path d="M12 5v14l9-7z" fill="currentColor" stroke="none" />
    </>
  ),
  queue: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
    </>
  ),
  listAdd: (
    <>
      <path d="M4 6h11" />
      <path d="M4 12h11" />
      <path d="M4 18h7" />
      <path d="M18 15v6" />
      <path d="M15 18h6" />
    </>
  ),
  queueAdd: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h6" />
      <path d="M15 15l4 3-4 3z" fill="currentColor" />
    </>
  ),
  shuffle: (
    <>
      <path d="M4 7h3c3 0 5 10 9 10h4" />
      <path d="M4 17h3c1.3 0 2.4-1 3.3-2.5" />
      <path d="M13.7 9.5C14.6 8 15.7 7 17 7h3" />
      <path d="M18 4l3 3-3 3" />
      <path d="M18 14l3 3-3 3" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3l3 3-3 3" />
      <path d="M4 12v-1a5 5 0 0 1 5-5h11" />
      <path d="M7 21l-3-3 3-3" />
      <path d="M20 12v1a5 5 0 0 1-5 5H4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7 10.5l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  // Passkey.
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9" />
      <path d="M18 12v3" />
      <path d="M21 12v2" />
    </>
  ),
  // Device to pair (TV).
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.1" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 18,
  filled = false,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
