/**
 * Accessibility audit in development (docs/design/accessibility.md): `await laternaAudit()` in the
 * console runs axe-core on the current page (WCAG 2.2 A and AA, best practices) and returns the
 * violations, one per rule, with the elements involved. Never in the build.
 */
export function installAudit(): void {
  Object.assign(window, {
    laternaAudit: async (root: Element | Document = document) => {
      const axe = (await import("axe-core")).default;
      const result = await axe.run(root, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
        resultTypes: ["violations"],
      });
      return result.violations.map((v) => ({
        rule: v.id,
        impact: v.impact,
        help: v.help,
        elements: v.nodes.map((n) => ({ target: n.target.join(" "), detail: n.failureSummary })),
      }));
    },
  });
}
