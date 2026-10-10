// @vitest-environment jsdom
import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { createRouterTransport, type Transport } from "@connectrpc/connect";
import { createConnectQueryKey, TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GetSubtitleSearchResponseSchema,
  type SearchSubtitleRequest,
  SubtitleSearchState,
  SubtitleService,
} from "../gen/laterna/v1/subtitle_pb";
import { SubtitleSearchForm, useSubtitleSearch } from "./SubtitleSearchForm";

afterEach(cleanup);

function Providers({
  transport,
  client = new QueryClient(),
  children,
}: {
  transport: Transport;
  client?: QueryClient;
  children: ReactNode;
}) {
  return (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </TransportProvider>
  );
}

const languages = [
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
];
const answer = (fields: MessageInitShape<typeof GetSubtitleSearchResponseSchema>) =>
  create(GetSubtitleSearchResponseSchema, { available: true, languages, ...fields });

describe("subtitle search form", () => {
  it("shows nothing when subtitles cannot be looked up", () => {
    const transport = createRouterTransport(() => {});
    const { container } = render(
      <Providers transport={transport}>
        <SubtitleSearchForm fileId="f1" search={answer({ available: false })} wanted={["fr"]} />
        <SubtitleSearchForm fileId="f1" search={undefined} wanted={["fr"]} />
      </Providers>,
    );
    expect(container.textContent).toBe("");
  });

  it("asks for the language the viewer wants, with the options ticked", async () => {
    let received: SearchSubtitleRequest | undefined;
    const transport = createRouterTransport(({ service }) => {
      service(SubtitleService, {
        searchSubtitle(req) {
          received = req;
          return {
            search: { fileId: req.fileId, language: req.language, state: SubtitleSearchState.SEARCHING },
          };
        },
      });
    });
    render(
      <Providers transport={transport}>
        <SubtitleSearchForm fileId="f1" search={answer({})} wanted={["", "fr-FR", "en"]} />
      </Providers>,
    );
    const language = screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement;
    expect(language.value).toBe("fr");
    fireEvent.click(screen.getByRole("checkbox", { name: "For the deaf and hard of hearing" }));
    fireEvent.click(screen.getByRole("button", { name: "Look for it" }));
    await waitFor(() => expect(received).toBeDefined());
    expect(received).toMatchObject({ fileId: "f1", language: "fr", hearingImpaired: true, forced: false });
  });

  it("says where the searches stand, and does not ask twice for one under way", () => {
    const transport = createRouterTransport(() => {});
    const searches = [
      { language: "en", state: SubtitleSearchState.NOT_FOUND, startedAt: { seconds: 1n } },
      { language: "fr", state: SubtitleSearchState.SEARCHING, startedAt: { seconds: 2n } },
    ];
    render(
      <Providers transport={transport}>
        <SubtitleSearchForm fileId="f1" search={answer({ searches })} wanted={["fr"]} />
      </Providers>,
    );
    expect(screen.getByRole("status").textContent).toBe("English: nothing found.French: searching...");
    const submit = screen.getByRole("button", { name: "Look for it" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "en" } });
    expect(submit.hasAttribute("disabled")).toBe(false);
  });

  it("says why the server refused", async () => {
    const transport = createRouterTransport(({ service }) => {
      service(SubtitleService, {
        searchSubtitle() {
          throw new Error("too many searches");
        },
      });
    });
    render(
      <Providers transport={transport}>
        <SubtitleSearchForm fileId="f1" search={answer({})} wanted={[]} />
      </Providers>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Look for it" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});

describe("useSubtitleSearch", () => {
  function Watcher({ fileId, onFound }: { fileId: string; onFound: () => void }) {
    const search = useSubtitleSearch(fileId, onFound);
    return <p>{search ? `${search.searches.length} searches` : "loading"}</p>;
  }

  it("tells the player when a search finds a subtitle, once, and not for what was found before", async () => {
    const found = { language: "en", state: SubtitleSearchState.FOUND, startedAt: { seconds: 1n } };
    let searches = [
      found,
      { language: "fr", state: SubtitleSearchState.SEARCHING, startedAt: { seconds: 2n } },
    ];
    const transport = createRouterTransport(({ service }) => {
      service(SubtitleService, { getSubtitleSearch: () => ({ available: true, languages, searches }) });
    });
    const client = new QueryClient();
    const onFound = vi.fn();
    render(
      <Providers transport={transport} client={client}>
        <Watcher fileId="f1" onFound={onFound} />
      </Providers>,
    );
    await waitFor(() => expect(screen.getByText("2 searches")).toBeTruthy());
    expect(onFound).not.toHaveBeenCalled();

    // The server announces the end of the search (SubtitleSearchChanged): the searches are read again.
    const reread = () =>
      client.invalidateQueries({
        queryKey: createConnectQueryKey({ schema: SubtitleService, cardinality: undefined }),
      });
    searches = [found, { language: "fr", state: SubtitleSearchState.FOUND, startedAt: { seconds: 2n } }];
    await reread();
    await waitFor(() => expect(onFound).toHaveBeenCalledTimes(1));
    await reread();
    expect(onFound).toHaveBeenCalledTimes(1);
  });
});
