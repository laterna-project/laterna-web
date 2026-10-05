import { describe, expect, it } from "vitest";
import { defaultPaper } from "./settings";

describe("reader settings", () => {
  it("takes the background that matches the theme", () => {
    expect(defaultPaper(" dark")).toBe("night");
    expect(defaultPaper("light")).toBe("paper");
    expect(defaultPaper("")).toBe("paper");
  });
});
