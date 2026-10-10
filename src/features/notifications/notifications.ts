// Notifications (server: docs/design/notifications.md): what a profile was told about, its
// requests and the new episodes of the series it follows. Every device of the profile shows the
// same list; the server announces a change (NotificationsChanged) and the list is read again.
import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { LinkProps } from "@tanstack/react-router";
import { ImageKind, pickImage } from "../../api/media";
import { serverText } from "../../api/text";
import type { Image, SearchResult } from "../../gen/laterna/v1/catalog_pb";
import { type Notification, NotificationKind } from "../../gen/laterna/v1/notification_pb";
import type { Universe } from "../../theme/contract";

/** What a notification says, in the interface language. */
export function notificationText(n: Pick<Notification, "text" | "summary">): string {
  return serverText(n.text) || n.summary;
}

export function notificationDate(n: Pick<Notification, "createdAt">): Date | undefined {
  return n.createdAt ? timestampDate(n.createdAt) : undefined;
}

type Item = SearchResult["item"];

/** Page of a catalog item named by a notification. */
function itemLink(item: Item): LinkProps | undefined {
  switch (item.case) {
    case "movie":
      return { to: "/movies/$id", params: { id: item.value.id } };
    case "series":
      return { to: "/series/$id", params: { id: item.value.id } };
    case "episode":
      return { to: "/episodes/$id", params: { id: item.value.id } };
    case "artist":
      return { to: "/music/artists/$id", params: { id: item.value.id } };
    case "album":
      return { to: "/music/albums/$id", params: { id: item.value.id } };
    case "track":
      return item.value.albumId ? { to: "/music/albums/$id", params: { id: item.value.albumId } } : undefined;
    case "bookSeries":
      return { to: "/bookshelf/series/$id", params: { id: item.value.id } };
    case "book":
      return { to: "/bookshelf", search: { book: item.value.id } };
    case "photoAlbum":
      return { to: "/photos/albums/$id", params: { id: item.value.id } };
    default:
      return undefined;
  }
}

/**
 * What a notification opens: the item it names, when the profile still sees it; otherwise the
 * requests. A request that waits or failed is handled in the administration by who administers.
 */
export function notificationLink(
  n: Pick<Notification, "kind" | "item" | "requestId">,
  admin: boolean,
): LinkProps | undefined {
  const link = n.item ? itemLink(n.item.item) : undefined;
  if (link) return link;
  if (!n.requestId) return undefined;
  const decided = n.kind === NotificationKind.REQUEST_PENDING || n.kind === NotificationKind.REQUEST_FAILED;
  return admin && decided ? { to: "/admin/requests" } : { to: "/requests" };
}

/** Picture of a notification: the image of its item, else the poster of its request. */
export interface NotificationArt {
  image?: Image;
  /** Poster of a request, served by the server; empty without one. */
  posterUrl: string;
  universe?: Universe;
  shape: "card" | "cover" | "disc" | "round";
}

export function notificationArt(n: Pick<Notification, "item" | "posterUrl">): NotificationArt {
  const item = n.item?.item;
  const images = (item?.value as { images?: Image[] } | undefined)?.images ?? [];
  const art = (universe: Universe, shape: NotificationArt["shape"], ...kinds: ImageKind[]) => ({
    image: pickImage(images, ...kinds),
    posterUrl: n.posterUrl,
    universe,
    shape,
  });
  switch (item?.case) {
    case "movie":
      return art("movies", "card", ImageKind.POSTER, ImageKind.THUMB, ImageKind.BACKDROP);
    case "series":
      return art("series", "card", ImageKind.POSTER, ImageKind.THUMB, ImageKind.BACKDROP);
    case "episode":
      return art("series", "card", ImageKind.THUMB, ImageKind.BACKDROP, ImageKind.POSTER);
    case "artist":
      return art("music", "round", ImageKind.POSTER, ImageKind.THUMB);
    case "album":
    case "track":
      return art("music", "disc", ImageKind.POSTER);
    case "bookSeries":
    case "book":
      return art("books", "cover", ImageKind.POSTER, ImageKind.THUMB);
    case "photoAlbum":
      return art("photos", "card", ImageKind.THUMB, ImageKind.POSTER);
    default:
      return { posterUrl: n.posterUrl, shape: "card" };
  }
}

/** The count on the bell: "99+" beyond two digits. */
export function badgeCount(unread: number): string {
  return unread > 99 ? "99+" : String(unread);
}
