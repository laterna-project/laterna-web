import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

/** "Movies · Laterna": tab title from the page title (data-page-title wins). */
export function pageTitle(heading: HTMLElement | null): string {
  const name = heading?.dataset.pageTitle || heading?.textContent?.replace(/\s+/g, " ").trim();
  return name ? `${name} · Laterna` : "Laterna";
}

/**
 * After each rendered page: tab title from the h1 (WCAG 2.4.2) and, when the path changes, focus on
 * that h1 so screen readers announce the new page. Not on first load, not under /play/ (the player,
 * readers and photo viewer manage their own focus), and not if the page already moved focus itself
 * (search field). The h1 may arrive after the data (missing or empty), so it is watched for a short
 * while.
 */
export function PageFocus() {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = router.subscribe("onRendered", (event) => {
      clearTimeout(timer);
      const moved = Boolean(event.fromLocation) && event.pathChanged;
      const inPlayer = event.toLocation.pathname.startsWith("/play/");
      let tries = 0;
      const apply = () => {
        const heading = document.querySelector<HTMLElement>("main h1") ?? document.querySelector("h1");
        // A title still empty is waiting for its data, like a missing one.
        const title = pageTitle(heading);
        if (title === "Laterna" && tries++ < 20) {
          timer = setTimeout(apply, 100);
          return;
        }
        document.title = title;
        if (!heading || !moved || inPlayer) return;
        const active = document.activeElement;
        const main = heading.closest("main");
        if (active && active !== document.body && main?.contains(active)) return;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      };
      apply();
    });
    // Language changed: the tab title follows the re-rendered h1.
    const onLanguage = () =>
      setTimeout(
        () =>
          (document.title = pageTitle(
            document.querySelector<HTMLElement>("main h1") ?? document.querySelector("h1"),
          )),
        0,
      );
    i18n.on("languageChanged", onLanguage);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      i18n.off("languageChanged", onLanguage);
    };
  }, [router]);
  return null;
}

/** "Skip to content": jumps over the header or the sidebar (WCAG 2.4.1). */
export function SkipLink({ target = "content" }: { target?: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={`#${target}`}
      className="skip-link"
      data-ui="skip-link"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById(target);
        if (!main) return;
        main.tabIndex = -1;
        main.focus();
      }}
    >
      {t("common.skipToContent")}
    </a>
  );
}
