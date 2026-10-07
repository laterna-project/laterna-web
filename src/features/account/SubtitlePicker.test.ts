import { describe, expect, it } from "vitest";
import { languageOptions, subtitleLanguages } from "./SubtitlePicker";

describe("subtitle languages", () => {
  it("are named in the interface language and sorted by name", () => {
    const fr = languageOptions("fr");
    expect(fr).toHaveLength(subtitleLanguages.length);
    expect(fr.find((l) => l.code === "de")?.name).toBe("allemand");
    expect(fr.find((l) => l.code === "en")?.name).toBe("anglais");
    const names = fr.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
    expect(languageOptions("en").find((l) => l.code === "de")?.name).toBe("German");
  });

  it("are codes the server recognizes, each once", () => {
    expect(new Set(subtitleLanguages).size).toBe(subtitleLanguages.length);
    // Left out on purpose: "hi" means "hearing impaired" in subtitle file names, so the server does
    // not read it as Hindi.
    expect(subtitleLanguages).not.toContain("hi");
  });
});
