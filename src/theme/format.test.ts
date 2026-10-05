import { describe, expect, it } from "vitest";
import { maxThemeSize, parseManifest, remoteUrls, slug, themeProblems } from "./format";

describe("theme format", () => {
  it("derives an identifier from the name", () => {
    expect(slug("Pink Neon!")).toBe("pink-neon");
    expect(slug("  Café   au lait ")).toBe("cafe-au-lait");
    expect(slug("!!!")).toBe("");
  });

  it("reads the manifest at the top of the file", () => {
    const css = `/* @laterna-theme
 * name: Pink Neon
 * author: Sam
 * version: 1.2
 * description: Dark, pink neon.
 * base: Lantern
 */
:root { --color-accent: #ff2d95; }`;
    expect(parseManifest(css)).toEqual({
      id: "pink-neon",
      name: "Pink Neon",
      author: "Sam",
      version: "1.2",
      description: "Dark, pink neon.",
      base: "lantern",
    });
    expect(parseManifest("/* @laterna-theme\nname: A\nid: My theme\n*/")).toMatchObject({ id: "my-theme" });
  });

  it("refuses a file without a manifest or a name", () => {
    expect(parseManifest(":root { --color-ink: red; }")).toMatch(/isn't a Laterna theme/);
    expect(parseManifest("/* other */ /* @laterna-theme name: A */")).toMatch(/isn't a Laterna theme/);
    expect(parseManifest("/* @laterna-theme\nauthor: Sam\n*/")).toMatch(/has no name/);
  });

  it("finds everything that would load from elsewhere", () => {
    expect(remoteUrls("a { background: url(data:image/png;base64,AAA) }")).toEqual([]);
    expect(remoteUrls('@font-face { src: url("data:font/woff2;base64,AA") }')).toEqual([]);
    expect(remoteUrls("a { background: url(https://elsewhere.example/x.png) }")).toEqual([
      "https://elsewhere.example/x.png",
    ]);
    expect(remoteUrls("a { background: URL( '/images/x' ) }")).toEqual(["/images/x"]);
    expect(remoteUrls('a { background: image-set("https://a.example/x.png" 1x, url("data:,") 2x) }')).toEqual(
      ["https://a.example/x.png"],
    );
    expect(remoteUrls("a { --background: url(//a.example/x) }")).toEqual(["//a.example/x"]);
  });

  it("says in plain words what is wrong", () => {
    expect(themeProblems(":root { --color-ink: #000; }")).toEqual([]);
    expect(themeProblems('@import "other.css";')[0]).toMatch(/@import/);
    expect(themeProblems("a { cursor: url(https://a.example/c.cur), auto }")[0]).toMatch(/data:/);
    expect(themeProblems("a{}".padEnd(maxThemeSize + 1, " "))[0]).toMatch(/is over/);
  });
});
