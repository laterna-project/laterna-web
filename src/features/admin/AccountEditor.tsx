import { create } from "@bufbuild/protobuf";
import { useMutation } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { AccountService, type AccountSummary } from "../../gen/laterna/v1/account_pb";
import { ActivityService } from "../../gen/laterna/v1/activity_pb";
import { LibraryAccessSchema } from "../../gen/laterna/v1/auth_pb";
import type { LibrarySummary } from "../../gen/laterna/v1/library_pb";
import { ParentalControlSchema } from "../../gen/laterna/v1/profile_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { scrollBehavior } from "../../ui/motion";
import { Status } from "../../ui/Status";
import { Switch } from "../../ui/Switch";
import { ageChoice, ages } from "../account/parental";
import { relativeTime } from "../catalog/format";
import { libraryKind } from "./admin";
import styles from "./admin.module.css";

/**
 * Create or edit an account: name, password, allowed libraries, the account's parental controls,
 * downloads, administrator, disabled; delete. The server always keeps an administrator: one cannot
 * remove one's own rights or account.
 */
export function AccountEditor({
  summary,
  self,
  libraries,
  color,
  onSaved,
  onDeleted,
}: {
  summary: AccountSummary | undefined;
  /** The caller's account. */
  self: boolean;
  libraries: readonly LibrarySummary[];
  /** Color of the account in the list. */
  color: string;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const a = summary?.account;
  const invalidate = useInvalidate();
  // On a narrow screen the editor goes under the list: bring it into view when it opens.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    void panel.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, []);
  const [username, setUsername] = useState(a?.username ?? "");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(a?.isAdmin ?? false);
  const [disabled, setDisabled] = useState(a?.disabled ?? false);
  const [denyDownloads, setDenyDownloads] = useState(a?.denyDownloads ?? false);
  const [all, setAll] = useState(!a?.libraries || a.libraries.all);
  const [libraryIds, setLibraryIds] = useState<string[]>(a?.libraries?.libraryIds ?? []);
  const [maxAge, setMaxAge] = useState<number | null>(a?.parental?.maxAge ?? null);
  const [blockUnrated, setBlockUnrated] = useState(a?.parental?.blockUnrated ?? false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const refresh = () => invalidate(AccountService, ActivityService);
  const createAccount = useMutation(AccountService.method.createAccount, {
    onSuccess: async (res) => {
      await refresh();
      if (res.account) onSaved(res.account.id);
    },
  });
  const updateAccount = useMutation(AccountService.method.updateAccount, {
    onSuccess: async () => {
      await refresh();
      setPassword("");
      setSaved(true);
    },
  });
  const deleteAccount = useMutation(AccountService.method.deleteAccount, {
    onSuccess: async () => {
      setDeleting(false);
      await refresh();
      onDeleted();
    },
  });

  const passwordOk = password === "" ? Boolean(a) : password.length >= 8;
  const access = create(LibraryAccessSchema, { all, libraryIds: all ? [] : libraryIds });
  const parental = create(ParentalControlSchema, { maxAge: maxAge ?? undefined, blockUnrated });
  const toggleLibrary = (id: string) => {
    setSaved(false);
    setAll(false);
    setLibraryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    // An administrator sees everything, without parental controls, and can always download.
    const limits = isAdmin ? {} : { libraries: access, parental, denyDownloads };
    if (!a) {
      createAccount.mutate({ username: username.trim(), password, isAdmin, ...limits });
      return;
    }
    updateAccount.mutate({
      accountId: a.id,
      username: username.trim() !== a.username ? username.trim() : undefined,
      password: password || undefined,
      isAdmin: isAdmin !== a.isAdmin ? isAdmin : undefined,
      disabled: disabled !== a.disabled ? disabled : undefined,
      ...(isAdmin
        ? {}
        : {
            libraries: access,
            parental,
            denyDownloads: denyDownloads !== a.denyDownloads ? denyDownloads : undefined,
          }),
    });
  };
  const error = createAccount.error ?? updateAccount.error;
  const lastActive = summary?.lastActiveAt
    ? new Date(Number(summary.lastActiveAt.seconds) * 1000)
    : undefined;

  return (
    <section ref={panel} className={styles.panel} aria-labelledby="chosen-account">
      <div className={styles.panelHead}>
        <span
          className={styles.initial}
          data-size="lg"
          style={a ? { background: color } : undefined}
          aria-hidden="true"
        >
          {(a?.username || "+").slice(0, 1).toUpperCase()}
        </span>
        <span>
          <h2 id="chosen-account" className={styles.panelTitle}>
            {a?.username ?? t("accountEditor.newAccount")}
          </h2>
          <span className={styles.muted}>
            {a
              ? [
                  t("adminAccounts.profiles", { count: summary?.profileCount ?? 0 }),
                  lastActive
                    ? t("adminAccounts.active", { when: relativeTime(lastActive) })
                    : t("accountEditor.neverSignedIn"),
                  self ? t("accountEditor.yourAccount") : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t("accountEditor.sameNameProfile")}
          </span>
        </span>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={t("accountEditor.username")}
          required
          autoComplete="off"
          value={username}
          onChange={(e) => {
            setSaved(false);
            setUsername(e.target.value);
          }}
        />
        {self ? (
          <p className={styles.note}>
            {t("accountEditor.ownPasswordBefore")}
            <Link to="/account">{t("nav.myAccount")}</Link>
            {t("accountEditor.ownPasswordAfter")}
          </p>
        ) : (
          <Field
            label={a ? t("accountEditor.newPassword") : t("accountEditor.password")}
            type="password"
            autoComplete="new-password"
            required={!a}
            placeholder={a ? t("accountEditor.passwordPlaceholder") : ""}
            hint={a ? t("accountEditor.passwordHint") : undefined}
            error={password && password.length < 8 ? t("password.tooShort") : undefined}
            value={password}
            onChange={(e) => {
              setSaved(false);
              setPassword(e.target.value);
            }}
          />
        )}

        <fieldset className={styles.fieldset} disabled={isAdmin}>
          <legend className={styles.label}>{t("accountEditor.libraries")}</legend>
          <div className={styles.choices}>
            <button
              type="button"
              className={styles.choice}
              aria-pressed={isAdmin || all}
              onClick={() => {
                setSaved(false);
                setAll(true);
              }}
            >
              {t("accountEditor.all")}
            </button>
            {libraries.map(({ library: l }) =>
              l ? (
                <button
                  key={l.id}
                  type="button"
                  className={styles.choice}
                  aria-pressed={!isAdmin && !all && libraryIds.includes(l.id)}
                  onClick={() => toggleLibrary(l.id)}
                >
                  <span
                    className={styles.dot}
                    style={{ background: `var(--color-${libraryKind(l.kind).universe})` }}
                  />
                  {l.name}
                </button>
              ) : null,
            )}
          </div>
          {!isAdmin && !all && libraryIds.length === 0 && (
            <p className={styles.warn}>{t("accountEditor.noLibrary")}</p>
          )}
        </fieldset>

        <fieldset className={styles.fieldset} disabled={isAdmin}>
          <legend className={styles.label}>{t("accountEditor.parental")}</legend>
          <div className={styles.choices}>
            {ages.map((g) => (
              <button
                key={String(g)}
                type="button"
                className={styles.choice}
                aria-pressed={!isAdmin && maxAge === g}
                onClick={() => {
                  setSaved(false);
                  setMaxAge(g);
                }}
              >
                {ageChoice(g)}
              </button>
            ))}
          </div>
          <p className={styles.muted}>{t("accountEditor.parentalHint")}</p>
        </fieldset>
        <Switch
          label={t("accountEditor.blockUnrated")}
          hint={t("account.blockUnratedHint")}
          on={!isAdmin && blockUnrated}
          disabled={isAdmin}
          onChange={(on) => {
            setSaved(false);
            setBlockUnrated(on);
          }}
        />
        <Switch
          label={t("accountEditor.noDownloads")}
          hint={t("accountEditor.noDownloadsHint")}
          tone="danger"
          on={!isAdmin && denyDownloads}
          disabled={isAdmin}
          onChange={(on) => {
            setSaved(false);
            setDenyDownloads(on);
          }}
        />
        {!self && (
          <Switch
            label={t("accountEditor.admin")}
            hint={t("accountEditor.adminHint")}
            on={isAdmin}
            onChange={(on) => {
              setSaved(false);
              setIsAdmin(on);
            }}
          />
        )}
        {a && !self && (
          <Switch
            label={t("accountEditor.disabled")}
            hint={t("accountEditor.disabledHint")}
            tone="danger"
            on={disabled}
            onChange={(on) => {
              setSaved(false);
              setDisabled(on);
            }}
          />
        )}
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Status className={styles.ok} message={saved ? t("accountEditor.saved") : ""} />
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={!username.trim() || !passwordOk || createAccount.isPending || updateAccount.isPending}
          >
            {a ? t("common.save") : t("accountEditor.create")}
          </Button>
          <span className={styles.spacer} />
          {a && !self && (
            <button type="button" className={styles.danger} onClick={() => setDeleting(true)}>
              {t("accountEditor.delete")}
            </button>
          )}
        </div>
      </form>

      {deleting && a && (
        <Dialog
          title={t("accountEditor.deleteTitle", { name: a.username })}
          onClose={() => setDeleting(false)}
        >
          <p>{t("accountEditor.deleteText")}</p>
          {deleteAccount.isError && <Alert>{errorMessage(deleteAccount.error)}</Alert>}
          <div className={styles.actions}>
            <span className={styles.spacer} />
            <Button onClick={() => setDeleting(false)} data-autofocus>
              {t("common.keep")}
            </Button>
            <Button
              variant="primary"
              disabled={deleteAccount.isPending}
              onClick={() => deleteAccount.mutate({ accountId: a.id })}
            >
              {t("common.delete")}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
