// @vitest-environment jsdom
import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createRouterTransport, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type ChooseRequestAlbumsRequest,
  MediaRequestSchema,
  RequestAlbumSchema,
  RequestKind,
  RequestSeasons,
  RequestService,
  RequestStatus,
} from "../../gen/laterna/v1/request_pb";
import { albumKind, albumKindLabel, albumKinds, kindName, profileKinds } from "./albums";
import { ChooseAlbumsDialog } from "./ChooseAlbums";
import { byTitle, requestStatus, seasonsLabel } from "./requests";

// jsdom knows <dialog> but does not open it as a modal.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
});
afterEach(cleanup);

const album = (fields: MessageInitShape<typeof RequestAlbumSchema>) =>
  create(RequestAlbumSchema, { type: "Album", ...fields });

describe("kinds of releases", () => {
  it("files an album under its secondary type when it has one", () => {
    expect(albumKind(album({}))).toBe("Album");
    expect(albumKind(album({ secondaryTypes: ["Live"] }))).toBe("Live");
    expect(albumKind(album({ type: "EP" }))).toBe("EP");
  });

  it("says what an album is, and nothing for a plain studio album", () => {
    expect(albumKindLabel(album({}))).toBe("");
    expect(albumKindLabel(album({ type: "EP" }))).toBe("EP");
    expect(albumKindLabel(album({ secondaryTypes: ["Soundtrack"] }))).toBe("Album · Soundtrack");
    expect(kindName("Mixtape/Street")).toBe("Mixtape/Street");
  });

  it("counts the kinds of a list, studio albums first", () => {
    const list = [
      album({ secondaryTypes: ["Live"] }),
      album({ type: "Single" }),
      album({}),
      album({}),
      album({ type: "EP" }),
    ];
    expect(albumKinds(list)).toEqual([
      { kind: "Album", count: 2 },
      { kind: "EP", count: 1 },
      { kind: "Single", count: 1 },
      { kind: "Live", count: 1 },
    ]);
  });

  it("says what a metadata profile keeps", () => {
    expect(profileKinds({ primaryTypes: ["Album", "EP"], secondaryTypes: ["Studio", "Live"] })).toBe(
      "Album, EP · Studio, Live",
    );
    expect(profileKinds({ primaryTypes: [], secondaryTypes: [] })).toBe("");
  });
});

describe("a request whose albums are chosen", () => {
  const request = (fields: MessageInitShape<typeof MediaRequestSchema>) =>
    create(MediaRequestSchema, { kind: RequestKind.ARTIST, seasons: RequestSeasons.CHOSEN, ...fields });

  it("says the albums are to choose, then names them", () => {
    expect(requestStatus(request({ status: RequestStatus.CHOOSING })).label).toBe("Albums to choose");
    expect(seasonsLabel(request({ status: RequestStatus.CHOOSING }))).toBe("");
    expect(seasonsLabel(request({ albumTitles: ["Moon Safari", "Talkie Walkie"] }))).toBe(
      "Moon Safari, Talkie Walkie",
    );
  });

  it("lines volumes up by their number", () => {
    const titles = byTitle([{ title: "One Piece 10" }, { title: "One Piece 2" }, { title: "one piece 1" }]);
    expect(titles.map((t) => t.title)).toEqual(["one piece 1", "One Piece 2", "One Piece 10"]);
  });
});

function Providers({ transport, children }: { transport: Transport; children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </TransportProvider>
  );
}

describe("album choice dialog", () => {
  const air = create(MediaRequestSchema, { id: "r1", kind: RequestKind.ARTIST, title: "Air" });
  const albums = [
    { key: "rg-moon", title: "Moon Safari", year: 1998, type: "Album", trackCount: 10 },
    {
      key: "rg-virgin",
      title: "The Virgin Suicides",
      year: 2000,
      type: "Album",
      secondaryTypes: ["Soundtrack"],
    },
    { key: "rg-talkie", title: "Talkie Walkie", year: 2004, type: "Album", monitored: true },
  ];

  it("asks for the albums ticked, and leaves alone what Lidarr already looks for", async () => {
    let received: ChooseRequestAlbumsRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(RequestService, {
        listRequestAlbums: () => ({ albums }),
        chooseRequestAlbums(req) {
          received = req;
          return { request: { id: "r1", title: "Air", status: RequestStatus.APPROVED } };
        },
      });
    });
    const done = vi.fn();
    render(
      <Providers transport={transport}>
        <ChooseAlbumsDialog request={air} onClose={() => undefined} onDone={done} />
      </Providers>,
    );
    const moon = await screen.findByRole("checkbox", { name: /Moon Safari/ });
    const talkie = screen.getByRole("checkbox", { name: /Talkie Walkie/ }) as HTMLInputElement;
    expect(talkie.disabled).toBe(true);
    expect(screen.getByText(/already asked for/)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Ask for 0 albums" });
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.click(moon);
    fireEvent.click(screen.getByRole("switch", { name: "Also the albums to come" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask for 1 album" }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(received).toMatchObject({ requestId: "r1", albumKeys: ["rg-moon"], futureAlbums: true });
  });

  it("filters by kind, and ticks what is shown", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(RequestService, { listRequestAlbums: () => ({ albums }) });
    });
    render(
      <Providers transport={transport}>
        <ChooseAlbumsDialog request={air} onClose={() => undefined} onDone={() => undefined} />
      </Providers>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Soundtrack (1)" }));
    expect(screen.queryByRole("checkbox", { name: /Moon Safari/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tick all" }));
    expect(screen.getByRole("button", { name: "Ask for 1 album" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Everything" }));
    fireEvent.click(screen.getByRole("button", { name: "Tick all" }));
    // The album Lidarr already looks for is not asked for again.
    expect(screen.getByRole("button", { name: "Ask for 2 albums" })).toBeTruthy();
  });

  it("says when Lidarr has not read the albums yet", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(RequestService, { listRequestAlbums: () => ({ albums: [] }) });
    });
    render(
      <Providers transport={transport}>
        <ChooseAlbumsDialog request={air} onClose={() => undefined} onDone={() => undefined} />
      </Providers>,
    );
    expect(await screen.findByText(/Lidarr is still reading/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
