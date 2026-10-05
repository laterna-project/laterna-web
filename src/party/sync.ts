// Sync of a watch party (server: docs/design/watch-party.md), without a browser: server time,
// expected position, catching up, waiting for members. Tested in sync.test.ts.
import type { Duration, Timestamp } from "@bufbuild/protobuf/wkt";
import { type PartyMember, type PartyState, PartyStatus } from "../gen/laterna/v1/party_pb";
import i18n from "../i18n";

const secs = (d: Duration | undefined) => (d ? Number(d.seconds) + d.nanos / 1e9 : 0);
export const millis = (t: Timestamp | undefined) => (t ? Number(t.seconds) * 1000 + t.nanos / 1e6 : 0);

/** One measurement of the server's time: send and receive (local time), server time. */
export interface ClockSample {
  sent: number;
  received: number;
  server: number;
}

/**
 * Offset server time - local time, in ms: the measurement with the shortest round trip, placing the
 * server's time in the middle of the round trip.
 */
export function clockOffset(samples: readonly ClockSample[]): number {
  const best = [...samples].sort((a, b) => a.received - a.sent - (b.received - b.sent))[0];
  return best ? best.server - (best.sent + best.received) / 2 : 0;
}

/**
 * Position of the group (in seconds) at the given server time: while playing, the state's position
 * moves on from its instant (which may be slightly in the future: common start).
 */
export function expectedPosition(
  state: Pick<PartyState, "status" | "position" | "at">,
  serverMs: number,
): number {
  const base = secs(state.position);
  if (state.status !== PartyStatus.PLAYING) return base;
  return Math.max(0, base + (serverMs - millis(state.at)) / 1000);
}

/** Drift tolerated, then caught up by speeding up or slowing down a little; beyond it, seek. */
export const tolerance = 0.12;
export const jumpBeyond = 1.2;

/**
 * What the device does to reach the group's position (drift = expected - current, in seconds):
 * nothing, a slightly changed speed, or a seek.
 */
export function correction(drift: number): { seek: boolean; rate: number } {
  const d = Math.abs(drift);
  if (d > jumpBeyond) return { seek: true, rate: 1 };
  if (d > tolerance) return { seek: false, rate: drift > 0 ? 1.05 : 0.95 };
  return { seek: false, rate: 1 };
}

/** Members the group waits for: not ready, or whose playback is loading. */
export function waitingFor(members: readonly PartyMember[]): PartyMember[] {
  return members.filter((m) => !m.ready || m.buffering);
}

export type MemberState = "sync" | "loading" | "ready" | "watching" | "paused";

/** A member's state: syncing, loading, ready, watching or paused. */
export function memberState(m: PartyMember, status: PartyStatus): MemberState {
  if (!m.synced) return "sync";
  if (m.buffering) return "loading";
  if (status === PartyStatus.WAITING) return m.ready ? "ready" : "loading";
  return status === PartyStatus.PLAYING ? "watching" : "paused";
}

/** A member's state in plain words. */
export function memberStatus(m: PartyMember, status: PartyStatus): string {
  return i18n.t(`party.status.${memberState(m, status)}`);
}

/** "Waiting for Lea", "Waiting for Lea and Hugo", "Waiting for 3 people". */
export function waitingLabel(members: readonly PartyMember[]): string {
  const names = members.map((m) => m.name);
  if (names.length === 0) return i18n.t("party.allReady");
  if (names.length === 1) return i18n.t("party.waitingOne", { name: names[0] });
  if (names.length === 2) return i18n.t("party.waitingTwo", { a: names[0], b: names[1] });
  return i18n.t("party.waitingMany", { n: names.length });
}
