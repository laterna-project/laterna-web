import { timestampDate } from "@bufbuild/protobuf/wkt";
import { createQueryOptions, useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { errorMessage } from "../api/errors";
import { formatUserCode } from "../api/next";
import { sessionToken } from "../api/session";
import { serverUrl } from "../api/transport";
import { restricted as isRestricted } from "../features/account/parental";
import { relativeTime } from "../features/catalog/format";
import { AuthService, type GetDeviceLoginResponse } from "../gen/laterna/v1/auth_pb";
import { universeBlock } from "../theme/universe";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { Status } from "../ui/Status";
import { Switch } from "../ui/Switch";
import styles from "./device.module.css";

interface Search {
  /** Code shown by the device (from the device's link or QR code). */
  code?: string;
}

// Outside the shell: approving needs a session, not a chosen profile.
export const Route = createFileRoute("/device")({
  validateSearch: (s: Record<string, unknown>): Search =>
    typeof s.code === "string" && s.code ? { code: formatUserCode(s.code) } : {},
  beforeLoad: ({ search }) => {
    if (sessionToken() === null)
      throw redirect({
        to: "/login",
        search: { next: search.code ? `/device?code=${encodeURIComponent(search.code)}` : "/device" },
      });
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(AuthService.method.getSession, {}, { transport: context.transport }),
    ),
  component: PairDevice,
});

/**
 * Pair a device (device login, server: docs/design/accounts.md): a TV shows a code, the person
 * types it here, sees who is asking, and approves it on their account or refuses.
 */
function PairDevice() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const session = useQuery(AuthService.method.getSession, {}).data?.session;
  const [code, setCode] = useState(search.code ?? "");
  const [found, setFound] = useState<{ code: string; login: GetDeviceLoginResponse } | null>(null);
  const [onProfile, setOnProfile] = useState(true);
  const [done, setDone] = useState("");
  const lookup = useMutation(AuthService.method.getDeviceLogin, {
    onSuccess: (login, req) => setFound({ code: req.userCode ?? "", login }),
  });
  const approve = useMutation(AuthService.method.approveDeviceLogin, {
    onSuccess: () => {
      setDone(t("pairing.approved", { device: found?.login.device?.name || t("pairing.theDevice") }));
      setFound(null);
      setCode("");
    },
  });
  const deny = useMutation(AuthService.method.denyDeviceLogin, {
    onSuccess: () => {
      setDone(t("pairing.denied"));
      setFound(null);
      setCode("");
    },
  });
  const profile = session?.profile;
  const restricted = profile ? isRestricted(profile) : false;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone("");
    approve.reset();
    deny.reset();
    lookup.mutate({ userCode: formatUserCode(code) });
  };
  const d = found?.login.device;
  const asked = found?.login.createdAt ? relativeTime(timestampDate(found.login.createdAt)) : "";

  return (
    <div className={styles.page} data-ui="entry" data-page="device">
      <div className={styles.steps} style={universeBlock("party")} aria-hidden="true">
        <div className={styles.step}>
          <span className={styles.stepLabel}>{t("pairing.step1")}</span>
          <span className={styles.stepText}>{t("pairing.step1Text")}</span>
          <span className={styles.sample}>BDWP-HQPK</span>
        </div>
        <div className={styles.step}>
          <span className={styles.stepLabel}>{t("pairing.step2")}</span>
          <span className={styles.stepText}>{t("pairing.step2Text")}</span>
        </div>
      </div>

      <main className={styles.panel}>
        <Logo />
        <h1 className={styles.title}>{t("pairing.title")}</h1>
        <p className={styles.lead}>{t("pairing.lead")}</p>
        {restricted ? (
          <Alert>
            {t("pairing.restricted")}{" "}
            <Link to="/profiles" className={styles.link}>
              {t("nav.switchProfile")}
            </Link>
          </Alert>
        ) : (
          <>
            <form className={styles.form} onSubmit={submit}>
              <label htmlFor="device-code" className="sr-only">
                {t("pairing.codeLabel")}
              </label>
              <input
                id="device-code"
                className={styles.code}
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="XXXX-XXXX"
                value={code}
                onChange={(e) => {
                  setFound(null);
                  setCode(formatUserCode(e.target.value));
                }}
              />
              {lookup.isError && <Alert>{errorMessage(lookup.error)}</Alert>}
              {!found && (
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={code.length < 9 || lookup.isPending}
                >
                  {t("pairing.continue")}
                </Button>
              )}
            </form>
            <Status className={styles.ok} message={done} />
            {found && (
              <>
                <div className={styles.device}>
                  <span className={styles.deviceIcon} aria-hidden="true">
                    <Icon name="tv" size={22} />
                  </span>
                  <span className={styles.deviceText}>
                    <span className={styles.deviceName}>
                      {[d?.name, d?.platform].filter(Boolean).join(" · ") || t("common.unnamedDevice")}
                    </span>
                    <span className={styles.muted}>
                      {[
                        d?.client && `${d.client} ${d.clientVersion}`.trim(),
                        found.login.ip,
                        asked && t("pairing.asked", { when: asked }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
                <p>
                  <Trans
                    i18nKey={profile && !onProfile ? "pairing.joinsChoose" : "pairing.joins"}
                    values={{ user: session?.account?.username }}
                    components={{ strong: <strong /> }}
                  />
                </p>
                {profile && (
                  <Switch
                    label={t("pairing.openOnProfile", { name: profile.name })}
                    hint={t("pairing.openOnProfileHint")}
                    on={onProfile}
                    onChange={setOnProfile}
                  />
                )}
                {(approve.isError || deny.isError) && (
                  <Alert>{errorMessage(approve.error ?? deny.error)}</Alert>
                )}
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={approve.isPending || deny.isPending}
                    onClick={() =>
                      approve.mutate({ userCode: found.code, selectProfile: Boolean(profile) && onProfile })
                    }
                  >
                    {t("pairing.allow")}
                  </Button>
                  <Button
                    size="lg"
                    disabled={approve.isPending || deny.isPending}
                    onClick={() => deny.mutate({ userCode: found.code })}
                  >
                    {t("pairing.deny")}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        <p className={styles.muted}>
          <Trans
            i18nKey="pairing.address"
            values={{ address: `${new URL("/device", serverUrl()).host}/device` }}
            components={{ strong: <strong /> }}
          />{" "}
          ·{" "}
          <Link to="/" className={styles.link}>
            {t("common.backHome")}
          </Link>
        </p>
      </main>
    </div>
  );
}
