# Accessibility

The client must work without a mouse or a screen: with the keyboard, with a screen reader, in high
contrast, with reduced motion. A single-page app has its own traps: the tab title does not change
by itself, a navigation tells screen readers nothing, an opened panel does not take focus with it.
Full-screen pages (player, readers, photo viewer, watch party) hide their controls when idle.

## Target and audit

- **WCAG 2.2, level AA.** Small screens are supported but have not been audited as a whole yet.
- **axe-core** (Deque, MPL-2.0), as a development dependency only. In `pnpm dev`,
  `await laternaAudit()` in the console runs axe on the current page (WCAG 2.0 to 2.2, A and AA,
  and best practices) and returns the violations. The module is only loaded when
  `import.meta.env.DEV` is true, so it never reaches the build. No headless browser automates it:
  the audit runs screen by screen in the development browser, like the keyboard checks.

## One way for each need

In `src/app` and `src/ui`:

- `PageFocus`: after each rendered page, the tab title comes from the `h1` ("Movies · Laterna";
  `data-page-title` wins, for the home page). When the path changes, focus moves to that `h1`,
  except under `/play/` and when the page already placed focus itself (search).
- `SkipLink` ("Skip to content") to `main#content`, in the shell and in the administration.
- Header menus use the disclosure pattern (a button with `aria-expanded`, Escape gives focus back
  to the button), not the `menu` role, which promises arrow-key navigation.
- `usePanelFocus`: a panel opened by a button receives focus; Escape closes it and gives focus back
  to the button, before the screen's own shortcuts.
- `Status`: success messages go into a `role="status"` region that exists before them.
- `scrollBehavior()`: scrolling done in JavaScript is not animated when the user asks for reduced
  motion.

## Contrast

Text at 4.5:1, components at 3:1, computed on the theme's tokens. Muted text on a universe color
is at 85 % opacity at most. The theme's focus ring comes with a transparent outline, which shows in
forced-colors mode.

## Consequences

- Every screen has a `main` and an `h1` (visually hidden when needed, as on the search page): the
  tab title depends on it.
- A new screen is checked with `laternaAudit()` and with the keyboard before it is done.
- Controls hidden when idle stay visible while the keyboard is on one of them
  (`:has(:focus-visible)`).
