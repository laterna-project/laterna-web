import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("capitalizes server messages", () => {
    expect(errorMessage(new ConnectError("current password is incorrect", Code.PermissionDenied))).toBe(
      "Current password is incorrect",
    );
  });

  it("replaces internal and network errors with a generic message", () => {
    expect(errorMessage(new ConnectError("panic", Code.Internal))).toMatch(/^The server ran into/);
    expect(errorMessage(new ConnectError("Failed to fetch", Code.Unavailable))).toMatch(
      /^The server isn't responding/,
    );
  });
});
