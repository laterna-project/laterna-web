// A second member to try a watch party (server: docs/design/watch-party.md): the test account joins
// the party with the given code, says it is ready when the group waits for it (after a fake load),
// greets, reacts, and tells what the group does. Ctrl+C: it leaves the party.
//
//   pnpm party:bot K7QM4X        after pnpm seed; LATERNA_URL for another server
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "../../src/gen/laterna/v1/auth_pb";
import { PartyService, PartyStatus } from "../../src/gen/laterna/v1/party_pb";
import { ProfileService } from "../../src/gen/laterna/v1/profile_pb";
import { log } from "./lib.ts";

const code = process.argv[2];
if (!code) {
  console.error("Usage: pnpm party:bot <code>");
  process.exit(1);
}
const baseUrl = process.env.LATERNA_URL ?? "http://localhost:8096";
const creds = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", ".dev", "seed.json"), "utf8"));

let token = "";
const bearer: Interceptor = (next) => (req) => {
  if (token) req.header.set("Authorization", `Bearer ${token}`);
  return next(req);
};
const transport = createConnectTransport({ baseUrl, interceptors: [bearer] });
const auth = createClient(AuthService, transport);
const profiles = createClient(ProfileService, transport);
const party = createClient(PartyService, transport);

token = (await auth.login({ ...creds.user })).token;
const profile = (await profiles.listProfiles({})).profiles[0];
if (!profile) throw new Error(`account "${creds.user.username}" has no profile`);
await profiles.selectProfile({ profileId: profile.id });

const joined = (await party.joinParty({ code })).party;
if (!joined) throw new Error("watch party not found");
const partyId = joined.id;
log(`"${profile.name}" joined watch party ${joined.code}`);

process.on("SIGINT", async () => {
  await party.leaveParty({ partyId }).catch(() => {});
  log("Left.");
  process.exit(0);
});

setTimeout(() => void party.sendPartyMessage({ partyId, text: "Hi, I'm here!" }), 1500);
setTimeout(() => void party.sendPartyMessage({ partyId, text: "👏", reaction: true }), 3000);

const names = ["?", "paused", "playing", "waiting"];
let last = "";
let readyTimer: ReturnType<typeof setTimeout> | undefined;
for await (const res of party.watchParty({ partyId })) {
  const u = res.update;
  if (u.case === "state") {
    const s = u.value;
    const me = s.members.find((m) => m.id === joined.memberId);
    const line = `${names[s.status]} · item ${s.index + 1}/${s.queue.length} · ${Number(s.position?.seconds ?? 0n)} s · ${s.members.length} members`;
    if (line !== last) log(line);
    last = line;
    // The group waits: fake 2.5 s load, then ready.
    if (s.status === PartyStatus.WAITING && me && !me.ready && !readyTimer)
      readyTimer = setTimeout(() => {
        readyTimer = undefined;
        void party.reportPartyStatus({ partyId, ready: true });
        log("  ready");
      }, 2500);
  } else if (u.case === "message") log(`  ${u.value.name}: ${u.value.text}`);
  else if (u.case === "ended") {
    log(`Ended: ${u.value}`);
    process.exit(0);
  }
}
