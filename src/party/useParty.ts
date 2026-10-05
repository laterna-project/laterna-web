import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { useQuery, useTransport } from "@connectrpc/connect-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../api/errors";
import { serverText } from "../api/text";
import {
  type ControlPartyRequest,
  type PartyMember,
  type PartyMessage,
  PartyService,
  type PartyState,
} from "../gen/laterna/v1/party_pb";
import i18n from "../i18n";
import { type ClockSample, clockOffset, millis } from "./sync";

export type Command = ControlPartyRequest["command"];

export interface Reaction {
  key: number;
  name: string;
  text: string;
}

/**
 * A watch party seen from this device: the group (GetParty), its state kept up to date by
 * WatchParty (reopened after a disconnection: after 30 s without a stream, the server removes the
 * member), the server's time, messages and reactions, and the commands.
 */
export function useParty(partyId: string) {
  const transport = useTransport();
  const client = useMemo(() => createClient(PartyService, transport), [transport]);
  const party = useQuery(PartyService.method.getParty, { partyId });
  const [state, setState] = useState<PartyState | null>(null);
  const version = useRef(-1n);
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [ended, setEnded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);

  // A state older than the one we have (response crossing the stream) is dropped.
  const apply = useCallback((s: PartyState | undefined) => {
    if (!s || s.version < version.current) return;
    version.current = s.version;
    setState(s);
  }, []);

  // Server time: a few round trips, the shortest measurement, redone every minute.
  useEffect(() => {
    let stop = false;
    const measure = async () => {
      const samples: ClockSample[] = [];
      for (let i = 0; i < 4 && !stop; i++) {
        const sent = Date.now();
        const res = await client.getServerTime({}).catch(() => null);
        const received = Date.now();
        if (res?.now) samples.push({ sent, received, server: millis(res.now) });
        await new Promise((r) => setTimeout(r, 120));
      }
      if (samples.length > 0) offset.current = clockOffset(samples);
    };
    void measure();
    const timer = setInterval(() => void measure(), 60_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [client]);

  // The group's stream, reopened after a disconnection.
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      let retry = 1000;
      while (!abort.signal.aborted) {
        try {
          for await (const res of client.watchParty({ partyId }, { signal: abort.signal })) {
            retry = 1000;
            const u = res.update;
            if (u.case === "state") apply(u.value);
            else if (u.case === "message") {
              const m = u.value;
              setMessages((list) => [...list.slice(-99), m]);
              if (m.reaction) {
                const key = Date.now() + Math.random();
                setReactions((list) => [...list, { key, name: m.name, text: m.text }]);
                setTimeout(() => setReactions((list) => list.filter((r) => r.key !== key)), 4000);
              }
            } else if (u.case === "ended") {
              setEnded(serverText(res.endedText) || u.value || i18n.t("party.ended"));
              return;
            }
          }
        } catch (err) {
          if (abort.signal.aborted) return;
          // Group not found (server restarted, member removed): no point insisting.
          const { code } = ConnectError.from(err);
          if (code === Code.NotFound || code === Code.PermissionDenied) {
            setEnded(errorMessage(err));
            return;
          }
        }
        if (abort.signal.aborted) return;
        await new Promise((r) => setTimeout(r, retry));
        retry = Math.min(retry * 2, 8000);
      }
    })();
    return () => abort.abort();
  }, [apply, client, partyId]);

  // The queue changed (added, new queue): refetch the group's items.
  const items = party.data?.party?.items ?? [];
  const known = items.map((i) => i.item.value?.id).join(",");
  const queue = state?.queue.join(",");
  const { refetch } = party;
  useEffect(() => {
    if (queue !== undefined && queue !== known) void refetch();
  }, [queue, known, refetch]);

  const memberId = party.data?.party?.memberId;
  const members = state?.members ?? party.data?.party?.state?.members ?? [];
  const me: PartyMember | undefined = members.find((m) => m.id === memberId);
  const canControl = Boolean(me && (!state?.hostOnly || me.host));

  const control = useCallback(
    async (command: Command) => {
      setError(null);
      try {
        apply((await client.controlParty({ partyId, command })).state);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [apply, client, partyId],
  );

  const report = useCallback(
    (r: { ready?: boolean; buffering?: boolean; endedIndex?: number }) => {
      void client
        .reportPartyStatus({
          partyId,
          ready: r.ready ?? false,
          buffering: r.buffering ?? false,
          endedIndex: r.endedIndex,
        })
        .catch(() => {});
    },
    [client, partyId],
  );

  const send = useCallback(
    async (text: string, reaction = false) => {
      try {
        await client.sendPartyMessage({ partyId, text, reaction });
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [client, partyId],
  );

  const run = useCallback(async (call: () => Promise<unknown>) => {
    try {
      await call();
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  return {
    party: party.data?.party,
    loadError: party.error,
    state: state ?? party.data?.party?.state ?? null,
    me,
    canControl,
    messages,
    reactions,
    ended,
    error,
    serverNow: useCallback(() => Date.now() + offset.current, []),
    control,
    report,
    send,
    leave: () => run(() => client.leaveParty({ partyId })),
    end: () => run(() => client.endParty({ partyId })),
    kick: (memberId: string) => run(() => client.kickPartyMember({ partyId, memberId })),
  };
}

export type PartySession = ReturnType<typeof useParty>;
