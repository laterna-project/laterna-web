import { create, toJson } from "@bufbuild/protobuf";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { afterEach, describe, expect, it } from "vitest";
import { AuthService } from "../gen/laterna/v1/auth_pb";
import { GetServerInfoResponseSchema, ServerService } from "../gen/laterna/v1/server_pb";
import { sessionToken, setSessionToken } from "./session";
import { authInterceptor } from "./transport";

/** Fake fetch: records the headers it receives and returns the given response. */
function fakeFetch(respond: () => Response) {
  const seen: Headers[] = [];
  const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Headers(init?.headers));
    return respond();
  };
  return { fetch, seen };
}

function client(fetch: typeof globalThis.fetch) {
  return createClient(
    ServerService,
    createConnectTransport({ baseUrl: "http://laterna.test", interceptors: [authInterceptor], fetch }),
  );
}

const refused = (message: string) => () =>
  new Response(JSON.stringify({ code: "unauthenticated", message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

const ok = () =>
  new Response(
    JSON.stringify(
      toJson(GetServerInfoResponseSchema, create(GetServerInfoResponseSchema, { name: "Living room" })),
    ),
    {
      headers: { "Content-Type": "application/json" },
    },
  );

afterEach(() => setSessionToken(null));

describe("authInterceptor", () => {
  it("sends nothing without a session", async () => {
    const { fetch, seen } = fakeFetch(ok);
    const info = await client(fetch).getServerInfo({});
    expect(info.name).toBe("Living room");
    expect(seen[0]?.get("Authorization")).toBeNull();
  });

  it("sends the session token", async () => {
    setSessionToken("lat_test");
    const { fetch, seen } = fakeFetch(ok);
    await client(fetch).getServerInfo({});
    expect(seen[0]?.get("Authorization")).toBe("Bearer lat_test");
  });

  it("forgets a token the server refuses", async () => {
    setSessionToken("lat_expired");
    const { fetch } = fakeFetch(refused("session expired"));
    const err = await client(fetch)
      .getServerInfo({})
      .catch((e: unknown) => ConnectError.from(e));
    expect(err).toBeInstanceOf(ConnectError);
    expect((err as ConnectError).code).toBe(Code.Unauthenticated);
    expect(sessionToken()).toBeNull();
  });

  it("keeps the token when the typed password is what was refused", async () => {
    setSessionToken("lat_valid");
    const { fetch } = fakeFetch(refused("current password is incorrect"));
    const auth = createClient(
      AuthService,
      createConnectTransport({ baseUrl: "http://laterna.test", interceptors: [authInterceptor], fetch }),
    );
    await expect(
      auth.changePassword({ currentPassword: "wrong", newPassword: "new-password-1" }),
    ).rejects.toThrow();
    expect(sessionToken()).toBe("lat_valid");
  });
});
