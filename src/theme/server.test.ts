import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  PaletteSchema,
  ThemeDensity,
  ThemeFont,
  ThemeMode,
  ThemeTokensSchema,
} from "../gen/laterna/v1/theme_pb";
import { universes } from "./contract";
import {
  contrast,
  mix,
  paletteProblems,
  paletteTokens,
  readable,
  serverThemeCss,
  shapeTokens,
} from "./server";

// The server's built-in "Laterna" theme (internal/app/themes.go).
const dark = create(PaletteSchema, {
  background: "#0f1115",
  surface: "#181b21",
  surfaceRaised: "#232730",
  text: "#eef0f3",
  textMuted: "#a3a9b4",
  accent: "#e8b04a",
  onAccent: "#1c1400",
  outline: "#2f343d",
  error: "#ff6b6b",
  onError: "#1f0505",
  success: "#4cc38a",
  warning: "#f2c94c",
});
const light = create(PaletteSchema, {
  background: "#f6f5f2",
  surface: "#ffffff",
  surfaceRaised: "#eceae5",
  text: "#16181d",
  textMuted: "#545a65",
  accent: "#8a5a00",
  onAccent: "#ffffff",
  outline: "#d5d2cb",
  error: "#b3261e",
  onError: "#ffffff",
  success: "#1b7a4a",
  warning: "#8f5d00",
});
// Universe colors of the Universe style.
const universe = {
  movies: "#ff7a45",
  series: "#5b4bdb",
  music: "#1fb57a",
  books: "#12b5b0",
  photos: "#a8d83c",
  collections: "#ffc83d",
  playlists: "#ff6fa5",
  party: "#3aa6ff",
};

describe("server themes", () => {
  it("computes contrasts and mixes", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#fff", "#000", 1)).toBe("#ffffff");
  });

  it("moves a color towards the ink until it is readable", () => {
    const c = readable("#ffc83d", "#16181d", ["#ffffff"]);
    expect(contrast(c, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(readable("#5b4bdb", "#16181d", ["#ffffff"])).toBe("#5b4bdb");
  });

  it.each([
    ["dark", dark, "dark"],
    ["light", light, "light"],
  ] as const)("%s palette: universe and state texts readable on their soft tint", (_, palette, scheme) => {
    const t = paletteTokens(palette, scheme, universe);
    expect(t["--color-canvas"]).toBe(palette.background);
    expect(t["--color-scheme"]).toBe(scheme);
    for (const name of [...universes, "danger", "success", "warning"]) {
      const text = t[`--color-${name}-text`] ?? "";
      const soft = t[`--color-${name}-soft`] ?? "";
      expect(contrast(text, soft), name).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, palette.surface), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("scales radius, density and font to the contract", () => {
    const tokens = create(ThemeTokensSchema, {
      radius: 12,
      density: ThemeDensity.COMPACT,
      font: ThemeFont.LEXEND,
    });
    const t = shapeTokens(tokens, { "--space-4": "16px", "--space-10": "40px" });
    expect(t["--radius-lg"]).toBe("12px");
    expect(t["--radius-2xl"]).toBe("19.2px");
    expect(t["--space-4"]).toBe("13px");
    expect(t["--space-10"]).toBe("32px");
    expect(t["--font-sans"]).toContain("Lexend");
    expect(t["--radius-poster"]).toBeUndefined();
    const flat = shapeTokens(create(ThemeTokensSchema, { radius: 0, density: ThemeDensity.COMFORTABLE }), {});
    expect(flat["--radius-xl"]).toBe("0px");
    expect(flat["--space-4"]).toBeUndefined();
    expect(flat["--font-sans"]).toBeUndefined();
  });

  it("reports insufficient contrasts like the server", () => {
    expect(paletteProblems(dark)).toEqual([]);
    expect(paletteProblems(light)).toEqual([]);
    const pale = create(PaletteSchema, { ...light, textMuted: "#b0b0b0", accent: "#f0e0c0" });
    const problems = paletteProblems(pale);
    expect(problems.some((p) => p.startsWith("Secondary text on background"))).toBe(true);
    expect(problems.some((p) => p.startsWith("Accent on background") && p.endsWith("at least 3:1"))).toBe(
      true,
    );
  });

  it("follows the device in automatic mode, otherwise forces the palette", () => {
    const tokens = create(ThemeTokensSchema, { dark, light, radius: 12, font: ThemeFont.INTER });
    const auto = serverThemeCss(tokens, ThemeMode.AUTO, {});
    expect(auto).toContain("@media (prefers-color-scheme: dark)");
    expect(auto.indexOf(light.background)).toBeLessThan(auto.indexOf(dark.background));
    const forced = serverThemeCss(tokens, ThemeMode.DARK, {});
    expect(forced).not.toContain("@media");
    expect(forced).toContain(`--color-canvas: ${dark.background};`);
    expect(forced).toContain("--color-scheme: dark;");
  });
});
