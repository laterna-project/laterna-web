// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pageTitle } from "./PageFocus";

describe("tab title", () => {
  const h1 = (html: string) => {
    const el = document.createElement("h1");
    el.innerHTML = html;
    return el;
  };

  it("uses the page title", () => {
    expect(pageTitle(h1("Movies"))).toBe("Movies · Laterna");
    expect(pageTitle(h1("Marya\n   Morevna"))).toBe("Marya Morevna · Laterna");
  });

  it("prefers data-page-title, and falls back to Laterna", () => {
    const home = h1("Good evening, Alex");
    home.dataset.pageTitle = "Home";
    expect(pageTitle(home)).toBe("Home · Laterna");
    expect(pageTitle(h1(""))).toBe("Laterna");
    expect(pageTitle(null)).toBe("Laterna");
  });
});
