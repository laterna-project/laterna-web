import { create } from "@bufbuild/protobuf";
import { DurationSchema, TimestampSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { PartyMemberSchema, PartyStatus } from "../gen/laterna/v1/party_pb";
import { clockOffset, correction, expectedPosition, memberStatus, waitingFor, waitingLabel } from "./sync";

const at = (ms: number) =>
  create(TimestampSchema, { seconds: BigInt(Math.floor(ms / 1000)), nanos: (ms % 1000) * 1e6 });
const pos = (s: number) => create(DurationSchema, { seconds: BigInt(s) });

describe("clock", () => {
  it("keeps the measurement with the shortest round trip", () => {
    // The server is 5 s ahead; the 2nd measurement (40 ms) is the most accurate.
    expect(
      clockOffset([
        { sent: 1000, received: 1400, server: 6300 },
        { sent: 2000, received: 2040, server: 7020 },
      ]),
    ).toBe(5000);
    expect(clockOffset([])).toBe(0);
  });
});

describe("group position", () => {
  it("moves on while playing, stays while paused", () => {
    const state = { status: PartyStatus.PLAYING, position: pos(100), at: at(50_000) };
    expect(expectedPosition(state, 53_500)).toBeCloseTo(103.5);
    expect(expectedPosition({ ...state, status: PartyStatus.PAUSED }, 53_500)).toBe(100);
  });

  it("a common start slightly in the future does not go backwards", () => {
    expect(expectedPosition({ status: PartyStatus.PLAYING, position: pos(0), at: at(10_000) }, 9_000)).toBe(
      0,
    );
  });

  it("catches up gently, seeks beyond a second", () => {
    expect(correction(0.05)).toEqual({ seek: false, rate: 1 });
    expect(correction(0.5)).toEqual({ seek: false, rate: 1.05 });
    expect(correction(-0.5)).toEqual({ seek: false, rate: 0.95 });
    expect(correction(3)).toEqual({ seek: true, rate: 1 });
  });
});

describe("members", () => {
  const m = (name: string, o: { ready?: boolean; buffering?: boolean; synced?: boolean } = {}) =>
    create(PartyMemberSchema, {
      name,
      ready: o.ready ?? true,
      buffering: o.buffering ?? false,
      synced: o.synced ?? true,
    });

  it("says who the group waits for", () => {
    const list = [m("Sam"), m("Maya", { ready: false }), m("Hugo", { buffering: true })];
    expect(waitingFor(list).map((x) => x.name)).toEqual(["Maya", "Hugo"]);
    expect(waitingLabel(waitingFor(list))).toBe("Waiting for Maya and Hugo");
    expect(waitingLabel([m("Maya")])).toBe("Waiting for Maya");
    expect(waitingLabel([m("a"), m("b"), m("c")])).toBe("Waiting for 3 people");
  });

  it("state of each member", () => {
    expect(memberStatus(m("Hugo", { synced: false }), PartyStatus.PLAYING)).toBe("catching up");
    expect(memberStatus(m("Maya", { ready: false }), PartyStatus.WAITING)).toBe("loading...");
    expect(memberStatus(m("Sam"), PartyStatus.WAITING)).toBe("ready");
    expect(memberStatus(m("Sam"), PartyStatus.PAUSED)).toBe("paused");
  });
});
