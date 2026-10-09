// @vitest-environment jsdom
import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createRouterTransport, type Transport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type CreateRequestRequest,
  MediaRequestSchema,
  RequestableState,
  RequestableTitleSchema,
  RequestDestinationSchema,
  RequestKind,
  RequestSeasons,
  RequestService,
  RequestStatus,
} from "../../gen/laterna/v1/request_pb";
import { RequestDialog, RequestRow } from "./ui";

// jsdom knows <dialog> but does not open it as a modal.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
});
afterEach(cleanup);

function Providers({ transport, children }: { transport: Transport; children: ReactNode }) {
  return (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </TransportProvider>
  );
}

const destination = (fields: MessageInitShape<typeof RequestDestinationSchema>) =>
  create(RequestDestinationSchema, { kind: RequestKind.SERIES, libraryName: "Anime", ...fields });

describe("request dialog", () => {
  it("asks for chosen seasons in the chosen destination", async () => {
    let received: CreateRequestRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(RequestService, {
        createRequest(req) {
          received = req;
          return {
            request: create(MediaRequestSchema, {
              id: "r1",
              title: "Frieren",
              status: RequestStatus.PENDING,
            }),
          };
        },
      });
    });
    const done = vi.fn();
    const title = create(RequestableTitleSchema, {
      kind: RequestKind.SERIES,
      externalId: 101n,
      title: "Frieren",
      seasonCount: 2,
      state: RequestableState.REQUESTABLE,
    });
    render(
      <Providers transport={transport}>
        <RequestDialog
          title={title}
          destinations={[destination({ id: "d1", name: "Shows" }), destination({ id: "d2", name: "Anime" })]}
          onClose={() => undefined}
          onDone={done}
        />
      </Providers>,
    );
    expect(screen.getByRole("heading", { name: 'Request "Frieren"' })).toBeTruthy();
    // The whole series by default; picking seasons asks for at least one.
    expect(screen.getByRole("button", { name: "Whole series" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Choose…" }));
    const submit = screen.getByRole("button", { name: "Request" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Season 2" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Destination" }), { target: { value: "d2" } });
    fireEvent.click(submit);
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(received?.externalId).toBe(101n);
    expect(received?.seasons).toBe(RequestSeasons.CHOSEN);
    expect(received?.seasonNumbers).toEqual([2]);
    expect(received?.destinationId).toBe("d2");
  });

  it("says why the server refused", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(RequestService, {
        createRequest() {
          throw new Error("quota");
        },
      });
    });
    const title = create(RequestableTitleSchema, {
      kind: RequestKind.MOVIE,
      externalId: 550n,
      title: "Perfect Blue",
    });
    render(
      <Providers transport={transport}>
        <RequestDialog
          title={title}
          destinations={[destination({ id: "m", kind: RequestKind.MOVIE })]}
          onClose={() => undefined}
          onDone={() => undefined}
        />
      </Providers>,
    );
    // A movie has no seasons, and a single destination needs no choice.
    expect(screen.queryByRole("button", { name: "Whole series" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Request" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});

describe("request row", () => {
  it("shows where a request stands and why it was declined", () => {
    const transport = createRouterTransport(() => undefined);
    render(
      <Providers transport={transport}>
        <ul>
          <RequestRow
            request={create(MediaRequestSchema, {
              kind: RequestKind.SERIES,
              title: "Mushishi",
              year: 2005,
              status: RequestStatus.DECLINED,
              seasons: RequestSeasons.LATEST,
              declineReason: "Already on Blu-ray",
              profileName: "Léa",
              username: "Martin family",
            })}
            who
          />
          <RequestRow
            request={create(MediaRequestSchema, {
              kind: RequestKind.MOVIE,
              title: "Perfect Blue",
              status: RequestStatus.DOWNLOADING,
              progress: 0.25,
            })}
          />
        </ul>
      </Providers>,
    );
    expect(screen.getByText("Declined")).toBeTruthy();
    expect(screen.getByText("Reason: Already on Blu-ray")).toBeTruthy();
    expect(screen.getByText(/Latest season · Léa \(Martin family\)/)).toBeTruthy();
    expect(
      screen.getByRole("progressbar", { name: "Download of Perfect Blue" }).getAttribute("aria-valuenow"),
    ).toBe("25");
  });
});
