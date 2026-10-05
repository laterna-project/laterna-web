/**
 * @font-face rules of the app's fonts, repeated in a book's documents (each chapter of an EPUB is a
 * separate page): URLs made absolute, since those documents do not have the app's address.
 */
export function fontFaces(families: readonly string[]): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const base = sheet.href ?? window.location.href;
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
      if (!families.includes(family)) continue;
      out.push(
        rule.cssText.replace(/url\((["']?)([^"')]+)\1\)/g, (_, _q: string, url: string) => {
          return `url("${new URL(url, base).href}")`;
        }),
      );
    }
  }
  return out.join("\n");
}

/** Families named by a CSS font stack ('"Literata Variable", Georgia, serif'). */
export function families(stack: string): string[] {
  return stack.split(",").map((f) => f.replace(/["']/g, "").trim());
}
