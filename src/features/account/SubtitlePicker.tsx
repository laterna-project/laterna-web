import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useInvalidate } from "../../api/invalidate";
import { AuthService } from "../../gen/laterna/v1/auth_pb";
import { ProfileService, SubtitleMode } from "../../gen/laterna/v1/profile_pb";
import { language as uiLanguage } from "../../i18n";
import styles from "./language.module.css";

/** Modes, in the order offered. */
const modes = [
  { mode: SubtitleMode.UNSPECIFIED, label: "subtitlePrefs.auto" },
  { mode: SubtitleMode.ALWAYS, label: "subtitlePrefs.always" },
  { mode: SubtitleMode.FORCED, label: "subtitlePrefs.forced" },
  { mode: SubtitleMode.OFF, label: "subtitlePrefs.off" },
] as const;

/**
 * Languages offered for subtitles: those whose two-letter code the server recognizes in the
 * files' tags (server: internal/naming/subtitle.go). Each is named in the interface language.
 */
export const subtitleLanguages = [
  "ar",
  "bg",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fi",
  "fr",
  "he",
  "hr",
  "hu",
  "it",
  "ja",
  "ko",
  "ms",
  "nb",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "th",
  "tr",
  "vi",
  "zh",
] as const;

/** The languages, named in `locale` and sorted by name. */
export function languageOptions(locale: string): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "language" });
  return subtitleLanguages
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/**
 * Subtitles a playback starts with, for the chosen profile (ProfileService.SetSubtitlePreferences):
 * when, and in which language. The server applies them on every device that asks.
 */
export function SubtitlePicker() {
  const { t } = useTranslation();
  const id = useId();
  const invalidate = useInvalidate();
  const profile = useQuery(AuthService.method.getSession, {}).data?.session?.profile;
  const save = useMutation(ProfileService.method.setSubtitlePreferences, {
    onSuccess: () => invalidate(AuthService, ProfileService),
  });
  if (!profile) return null;
  // The choice being saved shows at once; a refused one goes back to the profile's.
  const pending = save.isError ? undefined : save.variables;
  const mode = pending?.mode ?? profile.subtitleMode;
  const language = pending?.language ?? profile.subtitleLanguage;
  const choose = (next: { mode?: SubtitleMode; language?: string }) =>
    save.mutate({ mode: next.mode ?? mode, language: next.language ?? language });
  const own = profile.language || uiLanguage();
  const ownName = new Intl.DisplayNames([uiLanguage()], { type: "language" }).of(own) ?? own;
  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${id}-mode`} className={styles.label}>
          {t("subtitlePrefs.when")}
        </label>
        <select
          id={`${id}-mode`}
          className={styles.select}
          value={mode}
          onChange={(e) => choose({ mode: Number(e.target.value) as SubtitleMode })}
          aria-describedby={`${id}-hint`}
        >
          {modes.map((m) => (
            <option key={m.mode} value={m.mode}>
              {t(m.label)}
            </option>
          ))}
        </select>
        <span id={`${id}-hint`} className={styles.hint}>
          {t("subtitlePrefs.hint")}
        </span>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-language`} className={styles.label}>
          {t("subtitlePrefs.language")}
        </label>
        <select
          id={`${id}-language`}
          className={styles.select}
          value={language}
          disabled={mode === SubtitleMode.OFF}
          onChange={(e) => choose({ language: e.target.value })}
        >
          <option value="">{t("subtitlePrefs.languageDefault", { language: ownName })}</option>
          {languageOptions(uiLanguage()).map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
