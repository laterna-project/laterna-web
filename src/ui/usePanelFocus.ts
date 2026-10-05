import { useEffect, useRef } from "react";

/**
 * Panel opened by a button (audio and subtitles, queue, table of contents, settings, information):
 * when it opens, focus goes to its first active element; Escape closes it and gives focus back to
 * what opened it, before the screen's shortcuts. open can name the open panel ("toc", "settings"):
 * switching from one to another counts as opening. Returns the ref to put on the panel.
 */
export function usePanelFocus<T extends HTMLElement>(open: unknown, close: () => void) {
  const panel = useRef<T>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    // What opened the panel, not one of its own elements (the effect runs twice in strict mode).
    const active = document.activeElement;
    if (active instanceof HTMLElement && !panel.current?.contains(active)) opener.current = active;
    panel.current
      ?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
      ?.focus();
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current();
      opener.current?.focus();
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [open]);
  return panel;
}
