import { describe, expect, it } from "vitest";
import { formatUserCode, safeNext } from "./next";

describe("return after login", () => {
  it("accepts only a path of the app", () => {
    expect(safeNext("/device?code=BDWP-HQPK")).toBe("/device?code=BDWP-HQPK");
    expect(safeNext("//example.com")).toBeUndefined();
    expect(safeNext("https://example.com")).toBeUndefined();
    expect(safeNext("/\\example.com")).toBeUndefined();
    expect(safeNext(42)).toBeUndefined();
  });
});

describe("device code", () => {
  it("formats what is typed", () => {
    expect(formatUserCode("bdwp hqpk")).toBe("BDWP-HQPK");
    expect(formatUserCode("BDWPHQPKZZ")).toBe("BDWP-HQPK");
    expect(formatUserCode("bd-w")).toBe("BDW");
  });
});
