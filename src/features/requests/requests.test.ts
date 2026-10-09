import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  MediaRequestSchema,
  RequestableState,
  RequestKind,
  RequestSeasons,
  RequestStatus,
} from "../../gen/laterna/v1/request_pb";
import { decidable, requestKind, requestStatus, seasonsLabel, stateLabel } from "./requests";

describe("requests", () => {
  it("tells where a request stands", () => {
    const r = (fields: MessageInitShape<typeof MediaRequestSchema>) =>
      create(MediaRequestSchema, { kind: RequestKind.SERIES, ...fields });
    expect(requestStatus(r({ status: RequestStatus.PENDING }))).toEqual({
      label: "Waiting for approval",
      tone: undefined,
    });
    expect(requestStatus(r({ status: RequestStatus.DOWNLOADING, progress: 0.42 })).label).toBe(
      "Downloading · 42%",
    );
    expect(
      requestStatus(r({ status: RequestStatus.AVAILABLE, episodesAvailable: 3, episodesWanted: 12 })),
    ).toEqual({
      label: "Available · 3 of 12 episodes",
      tone: "ok",
    });
    expect(
      requestStatus(r({ status: RequestStatus.AVAILABLE, episodesAvailable: 12, episodesWanted: 12 })).label,
    ).toBe("Available");
    expect(requestStatus(r({ status: RequestStatus.DECLINED })).tone).toBe("warn");
  });

  it("names the seasons asked for", () => {
    const series = { kind: RequestKind.SERIES, seasonNumbers: [] as number[] };
    expect(seasonsLabel({ ...series, seasons: RequestSeasons.ALL })).toBe("Whole series");
    expect(seasonsLabel({ ...series, seasons: RequestSeasons.UNSPECIFIED })).toBe("Whole series");
    expect(seasonsLabel({ ...series, seasons: RequestSeasons.LATEST })).toBe("Latest season");
    expect(seasonsLabel({ ...series, seasons: RequestSeasons.CHOSEN, seasonNumbers: [2] })).toBe("Season 2");
    expect(seasonsLabel({ ...series, seasons: RequestSeasons.CHOSEN, seasonNumbers: [1, 3] })).toBe(
      "Seasons 1, 3",
    );
    expect(seasonsLabel({ kind: RequestKind.MOVIE, seasons: RequestSeasons.ALL, seasonNumbers: [] })).toBe(
      "",
    );
  });

  it("names kinds and search states", () => {
    expect(requestKind(RequestKind.MOVIE)).toEqual({ label: "Movie", universe: "movies" });
    expect(stateLabel(RequestableState.REQUESTABLE)).toBe("");
    expect(stateLabel(RequestableState.TRACKED)).toBe("On its way");
    expect(decidable(RequestStatus.FAILED)).toBe(true);
    expect(decidable(RequestStatus.APPROVED)).toBe(false);
  });
});
