import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { named } from "../../api/text";
import { type Palette, type Theme, ThemeMode, ThemeService } from "../../gen/laterna/v1/theme_pb";
import { fontName } from "../../theme/server";
import { Alert } from "../../ui/Alert";
import styles from "./account.module.css";

const modes = [
  { mode: ThemeMode.AUTO, label: "profileTheme.modeAuto" },
  { mode: ThemeMode.LIGHT, label: "profileTheme.modeLight" },
  { mode: ThemeMode.DARK, label: "profileTheme.modeDark" },
] as const;

/** Preview of a palette (decorative): background, surface, accent, secondary text. */
export function PaletteSwatch({ palette }: { palette: Palette | undefined }) {
  if (!palette) return null;
  return (
    <span className={styles.swatch} style={{ background: palette.background }} aria-hidden="true">
      <span style={{ background: palette.surface }} />
      <span style={{ background: palette.accent }} />
      <span style={{ background: palette.textMuted }} />
    </span>
  );
}

/**
 * Theme of this profile (server: docs/design/themes.md): chosen among the server's, with its mode,
 * and kept from one device to another. Any profile sets it, even a kid profile.
 */
export function ProfileTheme() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const mine = useQuery(ThemeService.method.getMyTheme, {}).data;
  const themes = useQuery(ThemeService.method.listThemes, {});
  const set = useMutation(ThemeService.method.setMyTheme, { onSuccess: () => invalidate(ThemeService) });
  const follows = mine?.followsServer ?? true;
  const current = follows ? "" : (mine?.theme?.id ?? "");
  const mode = mine?.mode ?? ThemeMode.AUTO;
  const server = themes.data?.themes.find((t) => t.serverDefault);
  const choose = (themeId: string, m: ThemeMode = mode) => set.mutate({ themeId, mode: m });

  return (
    <section className={styles.card} aria-labelledby="profile-theme" data-ui="theme-picker">
      <h2 id="profile-theme" className={styles.cardTitle}>
        {t("profileTheme.title")}
      </h2>
      <p className={styles.hint}>{t("profileTheme.intro")}</p>
      {themes.isError && <Alert>{errorMessage(themes.error)}</Alert>}
      {set.isError && <Alert>{errorMessage(set.error)}</Alert>}
      <div className={styles.themes}>
        <ThemeChoice
          name={t("profileTheme.server")}
          detail={
            server
              ? t("profileTheme.serverToday", { name: named(server.name, server.nameText) })
              : t("profileTheme.serverChosen")
          }
          theme={server}
          pressed={current === ""}
          disabled={set.isPending}
          onClick={() => choose("")}
        />
        {(themes.data?.themes ?? []).map((theme) => (
          <ThemeChoice
            key={theme.id}
            name={named(theme.name, theme.nameText)}
            detail={[fontName(theme.tokens?.font ?? 0), theme.builtIn ? t("profileTheme.builtIn") : ""]
              .filter(Boolean)
              .join(" · ")}
            theme={theme}
            pressed={current === theme.id}
            disabled={set.isPending}
            onClick={() => choose(theme.id)}
          />
        ))}
      </div>
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>{t("profileTheme.mode")}</legend>
        <div className={styles.chips}>
          {modes.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={styles.age}
              aria-pressed={mode === m.mode}
              disabled={set.isPending}
              onClick={() => choose(current, m.mode)}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function ThemeChoice({
  name,
  detail,
  theme,
  pressed,
  disabled,
  onClick,
}: {
  name: string;
  detail: string;
  theme: Theme | undefined;
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.theme}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={styles.swatches} aria-hidden="true">
        <PaletteSwatch palette={theme?.tokens?.light} />
        <PaletteSwatch palette={theme?.tokens?.dark} />
      </span>
      <span className={styles.themeText}>
        <span className={styles.themeName}>{name}</span>
        {detail && <span className={styles.hint}>{detail}</span>}
      </span>
    </button>
  );
}
