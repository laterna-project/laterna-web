import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  allThemes,
  applyTheme,
  importTheme,
  removeTheme,
  savedTheme,
  type Theme,
  themeTokens,
} from "../../theme/theme";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Status } from "../../ui/Status";
import styles from "./account.module.css";

/**
 * Tokens of a style for its preview, without its colors: those come from the profile's theme,
 * except the universe colors the style keeps.
 */
function styleTokens(theme: Theme): CSSProperties {
  return Object.fromEntries(
    Object.entries(themeTokens(theme)).filter(
      ([k]) =>
        !k.startsWith("--color-") ||
        /^--color-(films|series|music|books|photos|collections|lists|party)$/.test(k),
    ),
  ) as CSSProperties;
}

/** Name and description of a style: translated for built-in styles, the file's otherwise. */
function useStyleText() {
  const { t } = useTranslation();
  return (theme: Theme) =>
    theme.builtIn && (theme.id === "universe" || theme.id === "lantern")
      ? { name: t(`style.builtin.${theme.id}.name`), description: t(`style.builtin.${theme.id}.description`) }
      : { name: theme.name, description: theme.description };
}

/**
 * Style of this device (docs/design/themes.md): built-in styles and imported themes (a CSS file),
 * kept by the device for all its profiles. Each choice shows its own headings, shapes and universe
 * colors (set on the preview), in the colors of the profile's theme.
 */
export function ThemePicker() {
  const { t } = useTranslation();
  const text = useStyleText();
  const [themes, setThemes] = useState(allThemes);
  const [current, setCurrent] = useState(savedTheme);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // After a removal, the "Remove" button disappears: focus goes to the theme now chosen.
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (refocus > 0) list.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, [refocus]);

  const choose = (id: string) => {
    applyTheme(id);
    setCurrent(id);
  };

  const onFile = async (f: File | undefined) => {
    setError("");
    setDone("");
    if (!f) return;
    try {
      const theme = await importTheme(f);
      setThemes(allThemes());
      choose(theme.id);
      setDone(t("style.imported", { name: theme.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (theme: Theme) => {
    removeTheme(theme.id);
    setThemes(allThemes());
    setCurrent(savedTheme());
    setDone(t("style.removed", { name: text(theme).name }));
    setRefocus((n) => n + 1);
  };

  return (
    <section className={styles.card} aria-labelledby="appearance" data-ui="theme-picker">
      <h2 id="appearance" className={styles.cardTitle}>
        {t("style.title")}
      </h2>
      <p className={styles.hint}>{t("style.intro")}</p>
      <div ref={list} className={styles.themes}>
        {themes.map((theme) => (
          <div key={theme.id} className={styles.themeItem}>
            <button
              type="button"
              className={styles.theme}
              aria-pressed={current === theme.id}
              onClick={() => choose(theme.id)}
            >
              <span className={styles.themePreview} style={styleTokens(theme)} aria-hidden="true">
                <span className={styles.themeTitle}>Aa</span>
                <span className={styles.themeDots}>
                  <span style={{ background: "var(--color-movies)" }} />
                  <span style={{ background: "var(--color-series)" }} />
                  <span style={{ background: "var(--color-music)" }} />
                  <span style={{ background: "var(--color-accent)" }} />
                </span>
              </span>
              <span className={styles.themeText}>
                <span className={styles.themeName}>{text(theme).name}</span>
                {text(theme).description && <span className={styles.hint}>{text(theme).description}</span>}
                {!theme.builtIn && (
                  <span className={styles.hint}>
                    {[
                      theme.author && t("style.by", { author: theme.author }),
                      theme.version && t("style.version", { version: theme.version }),
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("style.importedLabel")}
                  </span>
                )}
              </span>
            </button>
            {!theme.builtIn && (
              <Button
                variant="quiet"
                onClick={() => remove(theme)}
                aria-label={t("style.removeLabel", { name: theme.name })}
              >
                {t("common.remove")}
              </Button>
            )}
          </div>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <Status className={styles.ok} message={done} />
      <div className={styles.actions}>
        <Button onClick={() => file.current?.click()}>{t("style.import")}</Button>
        <input
          ref={file}
          type="file"
          accept=".css,text/css"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className={styles.hint}>{t("style.warning")}</p>
      </div>
    </section>
  );
}
