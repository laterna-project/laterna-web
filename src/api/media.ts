import { create } from "@bufbuild/protobuf";
import { type Duration, DurationSchema } from "@bufbuild/protobuf/wkt";
import { type Image, ImageKind } from "../gen/laterna/v1/catalog_pb";
import i18n from "../i18n";
import { serverUrl } from "./transport";

/** Widths the server resizes images to (server: docs/design/api.md, images). */
export const imageWidths = [160, 240, 320, 480, 640, 960, 1280, 1920] as const;

/**
 * Width to request for an image shown cssWidth pixels wide: the step that is enough for this screen
 * (pixel density included), capped at the largest.
 */
export function imageWidthFor(cssWidth: number, dpr = 1): number {
  const want = cssWidth * Math.max(1, dpr);
  return imageWidths.find((w) => w >= want) ?? imageWidths[imageWidths.length - 1] ?? 1920;
}

/** Full URL of a server resource (image, stream...) given by a relative path. */
export function mediaUrl(path: string): string {
  return new URL(path, serverUrl()).toString();
}

/** URL of an image resized to a width (rounded up to the next step by the server). */
export function imageUrl(image: Image, width?: number): string {
  const url = mediaUrl(image.url);
  return width && width < image.width ? `${url}?w=${width}` : url;
}

/** srcset of an image: each useful step up to its original width. */
export function imageSrcSet(image: Image): string {
  const widths = imageWidths.filter((w) => w < image.width);
  return [
    ...widths.map((w) => `${mediaUrl(image.url)}?w=${w} ${w}w`),
    `${mediaUrl(image.url)} ${image.width}w`,
  ].join(", ");
}

/** First image of one of the wanted kinds, in order of preference. */
export function pickImage(images: readonly Image[], ...kinds: ImageKind[]): Image | undefined {
  for (const kind of kinds) {
    const found = images.find((i) => i.kind === kind);
    if (found) return found;
  }
  return undefined;
}

export { ImageKind };

/**
 * Rating as displayed: without the country prefix of NFO files ("FR:-12" -> "-12"), and one label
 * for the all-ages ratings (TP, U, G).
 */
export function formatRating(rating: string): string {
  const r = rating.replace(/^[A-Z]{2,3}\s*:\s*/i, "").trim();
  return /^(TP|U|G|TOUS PUBLICS|TOUT PUBLIC)$/i.test(r) ? i18n.t("format.allAges") : r;
}

/** Seconds of a google.protobuf.Duration (0 if missing). */
export function seconds(d: Duration | undefined): number {
  return d ? Number(d.seconds) + d.nanos / 1e9 : 0;
}

/** google.protobuf.Duration of a position in seconds (negative: 0). */
export function durationOf(position: number): Duration {
  const total = Math.max(0, position);
  const whole = Math.floor(total);
  return create(DurationSchema, { seconds: BigInt(whole), nanos: Math.round((total - whole) * 1e9) });
}

/** "2 h 46 min", "46 min": runtime of a movie or an episode. */
export function formatRuntime(total: number): string {
  const minutes = Math.round(total / 60);
  if (minutes < 60) return i18n.t("format.runtimeMinutes", { minutes: Math.max(1, minutes) });
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0
    ? i18n.t("format.runtimeHours", { hours })
    : i18n.t("format.runtimeHoursMinutes", { hours, minutes: String(m).padStart(2, "0") });
}

/** "1:12:05", "4:07": position in a playback. */
export function formatClock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
