import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorDetailSchema, TextSchema } from "../gen/laterna/v1/text_pb";
import { setLanguage } from "../i18n";
import { httpErrorMessage } from "./errors";
import { renderKey, serverText } from "./text";

afterEach(() => setLanguage("en", false));

describe("server texts", () => {
  it("translates the key with its parameters", async () => {
    const t = create(TextSchema, {
      key: "home.latest",
      params: { library: "Movies" },
      text: "Recently added in Movies",
    });
    expect(serverText(t)).toBe("Recently added in Movies");
    await setLanguage("fr", false);
    expect(serverText(t)).toBe("Ajouts récents dans Movies");
  });

  it("formats durations", () => {
    expect(renderKey("error.auth.too_many_attempts", { retry_after_seconds: "900" })).toBe(
      "Too many attempts, try again in 15 min",
    );
    expect(renderKey("error.request.rate_limited", { retry_after_seconds: "7200" })).toContain("2 h");
    expect(renderKey("error.auth.too_many_attempts", { retry_after_seconds: "61" })).toContain("2 min");
  });

  it("joins the list with the language's separator", () => {
    const t = create(TextSchema, {
      key: "activity.scan",
      params: { library: "Movies" },
      list: [
        create(TextSchema, { key: "activity.scan.added", params: { count: "3" } }),
        create(TextSchema, { key: "activity.scan.missing", params: { count: "1" } }),
      ],
    });
    expect(serverText(t)).toBe('Scan of "Movies": added: 3; missing: 1');
  });

  it("keeps the server's text for an unknown key", () => {
    expect(serverText(create(TextSchema, { key: "unknown.key", text: "Server text" }))).toBe("Server text");
    expect(serverText(undefined)).toBe("");
  });

  it("keeps the sentence of an activity entry written before texts had keys", () => {
    expect(serverText(create(TextSchema, { key: "literal", params: { text: "Library created" } }))).toBe(
      "Library created",
    );
  });

  it("reads the code of a route outside Connect", () => {
    expect(httpErrorMessage(null, "Proxy error")).toBeUndefined();
    expect(httpErrorMessage("unknown.code", "server text")).toBe("Server text");
    expect(create(ErrorDetailSchema, { code: "library.not_found" }).code).toBe("library.not_found");
  });
});
