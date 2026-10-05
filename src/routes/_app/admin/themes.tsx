import { clone, create } from "@bufbuild/protobuf";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import { imageUrl } from "../../../api/media";
import { saveBytes } from "../../../api/save";
import { named } from "../../../api/text";
import { PaletteSwatch } from "../../../features/account/ProfileTheme";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead } from "../../../features/admin/ui";
import {
  PaletteSchema,
  type Theme,
  ThemeDensity,
  ThemeFont,
  ThemeImageKind,
  ThemeService,
  type ThemeTokens,
  ThemeTokensSchema,
} from "../../../gen/laterna/v1/theme_pb";
import { fontName, type PaletteRole, paletteProblems, roleName, roles } from "../../../theme/server";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Field } from "../../../ui/Field";
import { Status } from "../../../ui/Status";

export const Route = createFileRoute("/_app/admin/themes")({
  component: Themes,
});

const densities = [
  { value: ThemeDensity.COMPACT, label: "adminThemes.densityCompact" },
  { value: ThemeDensity.COMFORTABLE, label: "adminThemes.densityComfortable" },
  { value: ThemeDensity.SPACIOUS, label: "adminThemes.densitySpacious" },
] as const;
const fonts = [ThemeFont.SYSTEM, ThemeFont.INTER, ThemeFont.ATKINSON, ThemeFont.LEXEND, ThemeFont.SERIF];

/**
 * Server themes (server: docs/design/themes.md): design tokens, never CSS, that each client maps.
 * Administrators create them and choose the server's; each profile picks its own in "My account".
 * The server refuses an unreadable theme.
 */
function Themes() {
  const { t } = useTranslation();
  const densityName = (d: ThemeDensity | undefined) => {
    const found = densities.find((x) => x.value === d);
    return found ? t(found.label) : undefined;
  };
  const invalidate = useInvalidate();
  const list = useQuery(ThemeService.method.listThemes, {});
  const [editing, setEditing] = useState<Theme | "new" | null>(null);
  const [removing, setRemoving] = useState<Theme | null>(null);
  const [done, setDone] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const refresh = (message: string) => async () => {
    await invalidate(ThemeService);
    setDone(message);
  };
  const setDefault = useMutation(ThemeService.method.setServerTheme, {
    onSuccess: refresh(t("adminThemes.serverChanged")),
  });
  const copy = useMutation(ThemeService.method.createTheme, {
    onSuccess: async (res) => {
      await refresh(t("adminThemes.copied", { name: res.theme?.name }))();
      if (res.theme) setEditing(res.theme);
    },
  });
  const exportTheme = useMutation(ThemeService.method.exportTheme, {
    onSuccess: (res) => saveBytes(res.data, res.fileName, "application/json"),
  });
  const importTheme = useMutation(ThemeService.method.importTheme, {
    onSuccess: async (res) => refresh(t("style.imported", { name: res.theme?.name }))(),
  });
  const remove = useMutation(ThemeService.method.deleteTheme, {
    onSuccess: async () => {
      setRemoving(null);
      await refresh(t("adminThemes.deleted"))();
    },
  });
  const themes = list.data?.themes ?? [];
  const server = themes.find((t) => t.serverDefault);
  const error = setDefault.error ?? copy.error ?? exportTheme.error ?? importTheme.error;

  return (
    <>
      <AdminHead title={t("adminThemes.title")} sub={t("adminThemes.subtitle")}>
        <Button onClick={() => file.current?.click()} disabled={importTheme.isPending}>
          {t("adminThemes.import")}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setDone("");
            importTheme.mutate({ data: new Uint8Array(await f.arrayBuffer()) });
          }}
        />
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t("adminThemes.new")}
        </Button>
      </AdminHead>
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}
      <Status className={styles.ok} message={done} />
      <div className={styles.stack}>
        <section className={styles.card} aria-labelledby="theme-list">
          <h2 id="theme-list" className={styles.cardTitle}>
            {t("adminThemes.count", { count: themes.length })}
          </h2>
          <ul className={styles.rows}>
            {themes.map((th) => (
              <li
                key={th.id}
                className={styles.themeRow}
                aria-current={editing !== "new" && editing?.id === th.id}
              >
                <span className={styles.swatches}>
                  <PaletteSwatch palette={th.tokens?.light} />
                  <PaletteSwatch palette={th.tokens?.dark} />
                </span>
                <span className={styles.libText}>
                  <span className={styles.libName}>{named(th.name, th.nameText)}</span>
                  <span className={styles.muted}>
                    {[
                      fontName(th.tokens?.font ?? ThemeFont.UNSPECIFIED),
                      t("adminThemes.radius", { value: th.tokens?.radius ?? 0 }),
                      densityName(th.tokens?.density)?.toLowerCase(),
                      th.builtIn ? t("adminThemes.builtIn") : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={styles.spacer} />
                <span className={styles.themeActions}>
                  {th.serverDefault ? (
                    <span className={styles.pill} data-tone="ok">
                      {t("adminThemes.serverTheme")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.small}
                      disabled={setDefault.isPending}
                      aria-label={t("adminThemes.makeServerLabel", { name: named(th.name, th.nameText) })}
                      onClick={() => {
                        setDone("");
                        setDefault.mutate({ themeId: th.id });
                      }}
                    >
                      {t("adminThemes.makeServer")}
                    </button>
                  )}
                  {th.builtIn ? (
                    <button
                      type="button"
                      className={styles.small}
                      disabled={copy.isPending}
                      aria-label={t("adminThemes.copyLabel", { name: named(th.name, th.nameText) })}
                      onClick={() => {
                        setDone("");
                        copy.mutate({
                          name: t("adminThemes.copyName", { name: named(th.name, th.nameText) }),
                          tokens: th.tokens,
                        });
                      }}
                    >
                      {t("adminThemes.copy")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.small}
                      aria-label={t("adminThemes.editLabel", { name: named(th.name, th.nameText) })}
                      onClick={() => setEditing(th)}
                    >
                      {t("common.edit")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.small}
                    disabled={exportTheme.isPending}
                    aria-label={t("adminThemes.exportLabel", { name: named(th.name, th.nameText) })}
                    onClick={() => exportTheme.mutate({ themeId: th.id })}
                  >
                    {t("adminThemes.export")}
                  </button>
                  {!th.builtIn && (
                    <button
                      type="button"
                      className={styles.danger}
                      aria-label={t("adminThemes.deleteLabel", { name: named(th.name, th.nameText) })}
                      onClick={() => setRemoving(th)}
                    >
                      {t("common.delete")}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
        {editing && (
          <ThemeEditor
            key={editing === "new" ? "new" : editing.id}
            theme={editing === "new" ? undefined : editing}
            start={server?.tokens}
            onDone={(message, theme) => {
              setDone(message);
              setEditing(theme ?? null);
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
      {removing && (
        <Dialog
          title={t("adminThemes.deleteTitle", { name: named(removing.name, removing.nameText) })}
          onClose={() => setRemoving(null)}
        >
          <p>{t("adminThemes.deleteText")}</p>
          {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
          <div className={styles.actions}>
            <Button onClick={() => setRemoving(null)} data-autofocus>
              {t("common.keep")}
            </Button>
            <button
              type="button"
              className={styles.danger}
              disabled={remove.isPending}
              onClick={() => remove.mutate({ themeId: removing.id })}
            >
              {t("common.delete")}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Editable copy of the tokens (generated messages are not modified in place). */
function editable(t: ThemeTokens | undefined): ThemeTokens {
  return create(ThemeTokensSchema, {
    dark: t?.dark ? clone(PaletteSchema, t.dark) : create(PaletteSchema),
    light: t?.light ? clone(PaletteSchema, t.light) : create(PaletteSchema),
    radius: t?.radius ?? 12,
    density: t?.density || ThemeDensity.COMFORTABLE,
    font: t?.font || ThemeFont.SYSTEM,
  });
}

function ThemeEditor({
  theme,
  start,
  onDone,
  onClose,
}: {
  theme: Theme | undefined;
  /** Starting tokens of a new theme: those of the server's theme. */
  start: ThemeTokens | undefined;
  onDone: (message: string, theme?: Theme) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [name, setName] = useState(theme?.name ?? "");
  const [tokens, setTokens] = useState(() => editable(theme?.tokens ?? start));
  const saved = async (message: string, th: Theme | undefined) => {
    await invalidate(ThemeService);
    onDone(message, th);
  };
  const createTheme = useMutation(ThemeService.method.createTheme, {
    onSuccess: (res) => saved(t("adminThemes.created", { name: res.theme?.name }), res.theme),
  });
  const updateTheme = useMutation(ThemeService.method.updateTheme, {
    onSuccess: (res) => saved(t("adminThemes.saved", { name: res.theme?.name }), res.theme),
  });
  const setImage = useMutation(ThemeService.method.setThemeImage, {
    onSuccess: (res, req) =>
      saved(
        req.kind === ThemeImageKind.LOGO
          ? t(req.data?.length ? "adminThemes.logoSaved" : "adminThemes.logoRemoved")
          : t(req.data?.length ? "adminThemes.backgroundSaved" : "adminThemes.backgroundRemoved"),
        res.theme,
      ),
  });
  const problems = [
    ...paletteProblems(tokens.dark ?? create(PaletteSchema)).map((problem) =>
      t("adminThemes.darkPrefix", { problem }),
    ),
    ...paletteProblems(tokens.light ?? create(PaletteSchema)).map((problem) =>
      t("adminThemes.lightPrefix", { problem }),
    ),
  ];
  const busy = createTheme.isPending || updateTheme.isPending;
  const error = createTheme.error ?? updateTheme.error ?? setImage.error;
  const change = (edit: (t: ThemeTokens) => void) =>
    setTokens((current) => {
      const next = clone(ThemeTokensSchema, current);
      edit(next);
      return next;
    });
  const setColor = (scheme: "dark" | "light", key: PaletteRole, value: string) =>
    change((t) => {
      t[scheme] ??= create(PaletteSchema);
      t[scheme][key] = value;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (theme) updateTheme.mutate({ themeId: theme.id, name: name.trim(), tokens });
    else createTheme.mutate({ name: name.trim(), tokens });
  };

  return (
    <section className={styles.card} aria-labelledby="theme-editor">
      <div className={styles.cardHead}>
        <h2 id="theme-editor" className={styles.cardTitle}>
          {theme ? t("adminThemes.editTitle", { name: theme.name }) : t("adminThemes.new")}
        </h2>
        <button type="button" className={styles.small} onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={t("adminThemes.name")}
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {(["light", "dark"] as const).map((scheme) => (
          <fieldset key={scheme} className={styles.fieldset}>
            <legend className={styles.label}>
              {scheme === "light" ? t("adminThemes.lightPalette") : t("adminThemes.darkPalette")}
            </legend>
            <div className={styles.colors}>
              {roles.map((r) => (
                <ColorField
                  key={r}
                  label={t("adminThemes.colorLabel", {
                    role: roleName(r),
                    scheme: scheme === "light" ? t("adminThemes.light") : t("adminThemes.dark"),
                  })}
                  shortLabel={roleName(r)}
                  value={String(tokens[scheme]?.[r] ?? "")}
                  onChange={(v) => setColor(scheme, r, v)}
                />
              ))}
            </div>
          </fieldset>
        ))}
        <div className={styles.grid2Fields}>
          <label className={styles.selectField}>
            <span className={styles.label}>{t("adminThemes.radiusLabel", { value: tokens.radius })}</span>
            <input
              type="range"
              min={0}
              max={24}
              value={tokens.radius}
              onChange={(e) => {
                const radius = Number(e.target.value);
                change((t) => {
                  t.radius = radius;
                });
              }}
            />
          </label>
          <label className={styles.selectField}>
            <span className={styles.label}>{t("adminThemes.density")}</span>
            <select
              className={styles.input}
              value={tokens.density}
              onChange={(e) => {
                const density = Number(e.target.value) as ThemeDensity;
                change((t) => {
                  t.density = density;
                });
              }}
            >
              {densities.map((d) => (
                <option key={d.value} value={d.value}>
                  {t(d.label)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.selectField}>
            <span className={styles.label}>{t("adminThemes.font")}</span>
            <select
              className={styles.input}
              value={tokens.font}
              onChange={(e) => {
                const font = Number(e.target.value) as ThemeFont;
                change((t) => {
                  t.font = font;
                });
              }}
            >
              {fonts.map((f) => (
                <option key={f} value={f}>
                  {fontName(f)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {problems.length > 0 && (
          <div className={styles.note} role="status">
            {t("adminThemes.refused")}
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <Alert>{errorMessage(error)}</Alert>}
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {theme ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </form>
      {theme && (
        <div className={styles.grid2Fields}>
          <ImageField
            label={t("adminThemes.logo")}
            current={theme.logo}
            busy={setImage.isPending}
            onChange={(data) => setImage.mutate({ themeId: theme.id, kind: ThemeImageKind.LOGO, data })}
          />
          <ImageField
            label={t("adminThemes.background")}
            current={theme.background}
            busy={setImage.isPending}
            onChange={(data) => setImage.mutate({ themeId: theme.id, kind: ThemeImageKind.BACKGROUND, data })}
          />
        </div>
      )}
    </section>
  );
}

/** A color: the browser's color picker and a "#rrggbb" input. */
function ColorField({
  label,
  shortLabel,
  value,
  onChange,
}: {
  label: string;
  shortLabel: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <span className={styles.color}>
      <input
        type="color"
        aria-label={label}
        value={valid ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        aria-label={t("adminThemes.colorCode", { label })}
        spellCheck={false}
        maxLength={7}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      <span>{shortLabel}</span>
    </span>
  );
}

/** Logo or background: JPEG, PNG or WebP of 8 MiB at most, replaced or removed. */
function ImageField({
  label,
  current,
  busy,
  onChange,
}: {
  label: string;
  current: Theme["logo"];
  busy: boolean;
  onChange: (data: Uint8Array<ArrayBuffer>) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.selectField}>
      <span className={styles.label}>{label}</span>
      {current ? (
        <img src={imageUrl(current, 320)} alt="" className={styles.themeImage} />
      ) : (
        <span className={styles.muted}>{t("common.none")}</span>
      )}
      <span className={styles.actions}>
        <button type="button" className={styles.small} disabled={busy} onClick={() => input.current?.click()}>
          {current ? t("common.replace") : t("common.choose")}
        </button>
        {current && (
          <button
            type="button"
            className={styles.small}
            disabled={busy}
            onClick={() => onChange(new Uint8Array())}
          >
            {t("common.remove")}
          </button>
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onChange(new Uint8Array(await f.arrayBuffer()));
        }}
      />
    </div>
  );
}
