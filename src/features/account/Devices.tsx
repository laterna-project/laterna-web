import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { AuthService } from "../../gen/laterna/v1/auth_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Status } from "../../ui/Status";
import { relativeDay } from "../catalog/format";
import styles from "./account.module.css";

/** Devices signed in to the account: each can be signed out, except this one ("Sign out"). */
export function Devices() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const sessions = useQuery(AuthService.method.listSessions, {});
  const revoke = useMutation(AuthService.method.revokeSession, {
    onSuccess: () => invalidate(AuthService),
  });
  const list = [...(sessions.data?.sessions ?? [])].sort((a, b) => Number(b.current) - Number(a.current));

  return (
    <section className={styles.card} aria-labelledby="devices">
      <h2 id="devices" className={styles.cardTitle}>
        {t("devices.title")}
      </h2>
      {revoke.isError && <Alert>{errorMessage(revoke.error)}</Alert>}
      <ul className={styles.devices}>
        {list.map((s) => {
          const used = s.lastUsedAt ? new Date(Number(s.lastUsedAt.seconds) * 1000) : undefined;
          return (
            <li key={s.id} className={styles.device}>
              <span className={styles.deviceKind} aria-hidden="true">
                {(s.device?.platform || s.device?.client || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.deviceText}>
                <span className={styles.deviceName}>{s.device?.name || t("common.unnamedDevice")}</span>
                <span className={styles.deviceSub}>
                  {[
                    s.device?.client,
                    s.device?.platform,
                    used && !s.current ? t("devices.seen", { when: relativeDay(used) }) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {s.current ? (
                <span className={styles.here}>{t("devices.thisDevice")}</span>
              ) : (
                <button
                  type="button"
                  className={styles.small}
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ sessionId: s.id })}
                >
                  {t("devices.signOutDevice")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Change the password: the server signs out the other devices. */
export function PasswordForm() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation(AuthService.method.changePassword, {
    onSuccess: () => {
      setCurrent("");
      setNext("");
      void invalidate(AuthService);
    },
  });
  const long = next.length >= 8;
  return (
    <section className={styles.card} aria-labelledby="password">
      <h2 id="password" className={styles.cardTitle}>
        {t("password.title")}
      </h2>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (current && long) change.mutate({ currentPassword: current, newPassword: next });
        }}
      >
        {change.isError && <Alert>{errorMessage(change.error)}</Alert>}
        <Status className={styles.ok} message={change.isSuccess ? t("password.changed") : ""} />
        <div className={styles.grid}>
          <Field
            label={t("password.current")}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <Field
            label={t("password.new")}
            type="password"
            autoComplete="new-password"
            value={next}
            error={next && !long ? t("password.tooShort") : undefined}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={!current || !long || change.isPending}>
            {t("password.change")}
          </Button>
          <span className={styles.hint}>{t("password.warning")}</span>
        </div>
      </form>
    </section>
  );
}
