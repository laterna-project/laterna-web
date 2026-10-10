import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { ImageKind } from "../../api/media";
import { NotificationKind, NotificationSchema } from "../../gen/laterna/v1/notification_pb";
import { badgeCount, notificationArt, notificationLink, notificationText } from "./notifications";

const notification = (fields: MessageInitShape<typeof NotificationSchema>) =>
  create(NotificationSchema, fields);

describe("notificationText", () => {
  it("translates the text the server composed", () => {
    const n = notification({
      summary: "Votre demande pour Suzume a été acceptée",
      text: { key: "notification.request_approved", params: { title: "Suzume" } },
    });
    expect(notificationText(n)).toBe("Your request for Suzume was approved");
  });

  it("keeps the server's sentence for a text this version does not know", () => {
    const n = notification({ summary: "Something new", text: { key: "notification.unknown", text: "?" } });
    expect(notificationText(n)).toBe("?");
    expect(notificationText(notification({ summary: "Something new" }))).toBe("Something new");
  });
});

describe("notificationLink", () => {
  it("opens the item the notification names", () => {
    const episode = notification({
      kind: NotificationKind.NEW_EPISODES,
      item: { item: { case: "episode", value: { id: "e1" } } },
    });
    expect(notificationLink(episode, false)).toEqual({ to: "/episodes/$id", params: { id: "e1" } });
    const series = notification({
      kind: NotificationKind.NEW_EPISODES,
      item: { item: { case: "series", value: { id: "s1" } } },
    });
    expect(notificationLink(series, false)).toEqual({ to: "/series/$id", params: { id: "s1" } });
    const album = notification({
      kind: NotificationKind.REQUEST_AVAILABLE,
      requestId: "r1",
      item: { item: { case: "album", value: { id: "a1" } } },
    });
    expect(notificationLink(album, true)).toEqual({ to: "/music/albums/$id", params: { id: "a1" } });
    const book = notification({ item: { item: { case: "book", value: { id: "b1" } } } });
    expect(notificationLink(book, false)).toEqual({ to: "/bookshelf", search: { book: "b1" } });
  });

  it("opens the requests when there is no item to open", () => {
    const declined = notification({ kind: NotificationKind.REQUEST_DECLINED, requestId: "r1" });
    expect(notificationLink(declined, false)).toEqual({ to: "/requests" });
    expect(notificationLink(declined, true)).toEqual({ to: "/requests" });
  });

  it("sends who administers to the administration for a request to decide or to look into", () => {
    const pending = notification({ kind: NotificationKind.REQUEST_PENDING, requestId: "r1" });
    expect(notificationLink(pending, true)).toEqual({ to: "/admin/requests" });
    const failed = notification({ kind: NotificationKind.REQUEST_FAILED, requestId: "r1" });
    expect(notificationLink(failed, true)).toEqual({ to: "/admin/requests" });
    expect(notificationLink(failed, false)).toEqual({ to: "/requests" });
  });

  it("opens nothing without an item or a request", () => {
    expect(notificationLink(notification({ kind: NotificationKind.NEW_EPISODES }), true)).toBeUndefined();
  });
});

describe("notificationArt", () => {
  it("takes the image of the item, in the color of its universe", () => {
    const poster = { url: "/images/i1/abc", kind: ImageKind.POSTER };
    const n = notification({ item: { item: { case: "series", value: { id: "s1", images: [poster] } } } });
    expect(notificationArt(n)).toMatchObject({ image: poster, universe: "series", shape: "card" });
    const artist = notification({ item: { item: { case: "artist", value: { id: "a1" } } } });
    expect(notificationArt(artist)).toMatchObject({ image: undefined, universe: "music", shape: "round" });
  });

  it("falls back on the poster of the request", () => {
    const n = notification({ requestId: "r1", posterUrl: "/requests/posters/abc" });
    expect(notificationArt(n)).toEqual({ posterUrl: "/requests/posters/abc", shape: "card" });
  });
});

describe("badgeCount", () => {
  it("stops counting at 99", () => {
    expect(badgeCount(3)).toBe("3");
    expect(badgeCount(99)).toBe("99");
    expect(badgeCount(100)).toBe("99+");
  });
});
