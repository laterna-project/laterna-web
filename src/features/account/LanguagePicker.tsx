import { useMutation } from "@connectrpc/connect-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useInvalidate } from "../../api/invalidate";
import { AuthService } from "../../gen/laterna/v1/auth_pb";
import { ProfileService } from "../../gen/laterna/v1/profile_pb";
import { type Language, language, languages, setLanguage } from "../../i18n";
import styles from "./language.module.css";

/**
 * Interface language on this device (docs/design/i18n.md): each language is named in its own
 * language, and the label also says "language", for whoever cannot read the language shown.
 * `inline`: label and list on one line, for the entry screens. `profile`: the language is also
 * saved on the chosen profile (ProfileService.SetLanguage), which takes it to its other devices as
 * long as they have not chosen one.
 */
export function LanguagePicker({
  hint = false,
  inline = false,
  profile = false,
}: {
  hint?: boolean;
  inline?: boolean;
  profile?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const invalidate = useInvalidate();
  const save = useMutation(ProfileService.method.setLanguage, {
    onSuccess: () => invalidate(AuthService, ProfileService),
  });
  const choose = async (lang: Language) => {
    await setLanguage(lang);
    if (profile) save.mutate({ language: lang });
  };
  // Read again on each change: useTranslation re-renders the component.
  const current = language();
  return (
    <div className={inline ? `${styles.field} ${styles.inline}` : styles.field}>
      <label htmlFor={id} className={styles.label}>
        {t("language.label")}
      </label>
      <select
        id={id}
        className={styles.select}
        value={current}
        onChange={(e) => void choose(e.target.value as Language)}
        aria-describedby={hint ? `${id}-aide` : undefined}
      >
        {languages.map((l) => (
          <option key={l.id} value={l.id} lang={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {hint && (
        <span id={`${id}-aide`} className={styles.hint}>
          {t("language.hint")}
        </span>
      )}
    </div>
  );
}
