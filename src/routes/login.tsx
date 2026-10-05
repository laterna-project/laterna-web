import { createClient } from "@connectrpc/connect";
import { useMutation, useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { startSession } from "../api/auth";
import { currentDevice, deviceName, saveDeviceName } from "../api/device";
import { errorMessage } from "../api/errors";
import { imageUrl, seconds } from "../api/media";
import { safeNext } from "../api/next";
import { getPasskey, passkeyError, passkeysSupported } from "../api/passkeys";
import { sessionToken } from "../api/session";
import { serverText } from "../api/text";
import { serverUrl } from "../api/transport";
import { LanguagePicker } from "../features/account/LanguagePicker";
import { AuthService, OidcLoginState, type Session } from "../gen/laterna/v1/auth_pb";
import type { Universe } from "../theme/contract";
import { useThemeImages } from "../theme/ServerTheme";
import { universeBlock } from "../theme/universe";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { Status } from "../ui/Status";
import styles from "./login.module.css";

interface Search {
  /** Page to return to once signed in ("Pair a device" needs a session). */
  next?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const next = safeNext(s.next);
    return next ? { next } : {};
  },
  beforeLoad: ({ search }) => {
    if (sessionToken() !== null) throw redirect({ href: search.next ?? "/" });
  },
  component: Login,
});

const tiles = [
  "movies",
  "series",
  "music",
  "books",
  "photos",
  "party",
] as const satisfies readonly Universe[];

function Login() {
  const { t } = useTranslation();
  const { serverInfo } = Route.useRouteContext();
  const { next } = Route.useSearch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const passkeys = serverInfo.passkeys && passkeysSupported();
  const oidc = serverInfo.oidcProvider;
  // With a passkey or a provider available, the password comes second.
  const [withPassword, setWithPassword] = useState(!passkeys && !oidc);
  // The server theme's background, instead of the universe tiles.
  const { background } = useThemeImages();

  const enter = async (token: string, session: Session | undefined) => {
    startSession(queryClient, token);
    if (next) await navigate({ href: next });
    else await navigate({ to: session?.profile ? "/" : "/profiles" });
  };

  return (
    <div className={styles.page} data-ui="entry" data-page="login">
      {background ? (
        <div
          className={styles.backdrop}
          style={{ backgroundImage: `url("${imageUrl(background, 1920)}")` }}
          aria-hidden="true"
        />
      ) : (
        <div className={styles.tiles} aria-hidden="true">
          {tiles.map((u) => (
            <div key={u} className={styles.tile} style={universeBlock(u)}>
              <span className={styles.shape} />
              <span className={styles.tileLabel}>{t(`login.tiles.${u}.label`)}</span>
              <span className={styles.tileText}>{t(`login.tiles.${u}.text`)}</span>
            </div>
          ))}
        </div>
      )}

      <main className={styles.panel}>
        <div className={styles.top}>
          <Logo />
          <LanguagePicker inline />
        </div>
        <h1 className={styles.title}>{t("login.title")}</h1>
        <p className={styles.server}>
          <span className={styles.online} aria-hidden="true" />
          {t("login.server", { name: serverInfo.name, host: new URL(serverUrl()).host })}
        </p>
        {(passkeys || oidc) && (
          <div className={styles.methods}>
            {passkeys && <PasskeyLogin onSession={enter} />}
            {oidc && <OidcLogin provider={oidc} onSession={enter} />}
          </div>
        )}
        {withPassword ? (
          <>
            {(passkeys || oidc) && (
              <p className={styles.or}>
                <span>{t("login.or")}</span>
              </p>
            )}
            <PasswordLogin onSession={enter} autoFocus={Boolean(passkeys || oidc)} />
          </>
        ) : (
          <>
            <p className={styles.or}>
              <span>{t("login.or")}</span>
            </p>
            <button type="button" className={styles.textButton} onClick={() => setWithPassword(true)}>
              {t("login.usePassword")}
            </button>
          </>
        )}
        <p className={styles.tv}>
          <Icon name="tv" size={24} />
          <span>
            <Trans
              i18nKey="login.tv"
              values={{ address: `${new URL(serverUrl()).host}/device` }}
              components={{ strong: <strong />, link: <Link to="/device" className={styles.tvLink} /> }}
            />
          </span>
        </p>
      </main>
    </div>
  );
}

type OnSession = (token: string, session: Session | undefined) => Promise<void>;

function PasswordLogin({ onSession, autoFocus }: { onSession: OnSession; autoFocus: boolean }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [device, setDevice] = useState(deviceName);
  const login = useMutation(AuthService.method.login, {
    onSuccess: async (res) => {
      saveDeviceName(device);
      await onSession(res.token, res.session);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password, device: currentDevice(device) });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <Field
        label={t("entry.username")}
        autoComplete="username"
        autoCapitalize="none"
        required
        // Opened on request: typing starts right away.
        autoFocus={autoFocus}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Field
        label={t("entry.password")}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Field
        label={t("entry.deviceName")}
        hint={t("entry.deviceNameHint")}
        required
        value={device}
        onChange={(e) => setDevice(e.target.value)}
      />
      {login.isError && <Alert>{errorMessage(login.error)}</Alert>}
      <Button type="submit" variant="primary" size="lg" disabled={login.isPending}>
        {login.isPending ? t("login.signingIn") : t("login.signIn")}
      </Button>
      <p className={styles.note}>{t("login.lockout")}</p>
    </form>
  );
}

/** Passkey login (server: docs/design/accounts.md): no username, the device offers its passkeys. */
function PasskeyLogin({ onSession }: { onSession: OnSession }) {
  const { t } = useTranslation();
  const transport = useTransport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    setError("");
    setBusy(true);
    try {
      const auth = createClient(AuthService, transport);
      const begin = await auth.beginPasskeyLogin({});
      const credentialJson = await getPasskey(begin.optionsJson);
      const res = await auth.finishPasskeyLogin({
        loginId: begin.loginId,
        credentialJson,
        device: currentDevice(),
      });
      await onSession(res.token, res.session);
    } catch (err) {
      setError(passkeyError(err) ?? errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={styles.primary} disabled={busy} onClick={() => void start()}>
        <Icon name="key" size={22} />
        {busy ? t("login.passkeyWaiting") : t("login.passkey")}
      </button>
      <p className={styles.note}>{t("login.passkeyNote")}</p>
      {error && <Alert>{error}</Alert>}
    </>
  );
}

/**
 * OpenID Connect login (server: docs/design/accounts.md): the provider's page opens in a tab, the
 * person signs in there and confirms the device on the server's page; here the server is polled
 * until it hands over the session.
 */
function OidcLogin({ provider, onSession }: { provider: string; onSession: OnSession }) {
  const { t } = useTranslation();
  const transport = useTransport();
  const [pending, setPending] = useState<{ loginId: string; url: string; interval: number } | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);

  const start = async () => {
    setError("");
    setBlocked(false);
    // Opened right away, during the click: otherwise the browser blocks the window.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const auth = createClient(AuthService, transport);
      const res = await auth.startOidcLogin({ device: currentDevice() });
      const interval = Math.max(1, seconds(res.interval) || 2);
      if (tab) tab.location.href = res.authorizationUrl;
      else setBlocked(true);
      setPending({ loginId: res.loginId, url: res.authorizationUrl, interval });
      const abort = new AbortController();
      stop.current?.abort();
      stop.current = abort;
      while (!abort.signal.aborted) {
        await new Promise((r) => setTimeout(r, interval * 1000));
        if (abort.signal.aborted) return;
        const poll = await auth.pollOidcLogin({ loginId: res.loginId }, { signal: abort.signal });
        if (poll.state === OidcLoginState.PENDING) continue;
        setPending(null);
        if (poll.state === OidcLoginState.APPROVED) await onSession(poll.token, poll.session);
        else if (poll.state === OidcLoginState.DENIED)
          setError(
            serverText(poll.messageText) ||
              (poll.message ? errorMessage(new Error(poll.message)) : t("login.oidcDenied")),
          );
        else setError(t("login.oidcExpired"));
        return;
      }
    } catch (err) {
      tab?.close();
      setPending(null);
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(errorMessage(err));
    }
  };

  const cancel = () => {
    stop.current?.abort();
    setPending(null);
  };

  return (
    <>
      <button
        type="button"
        className={styles.secondary}
        disabled={Boolean(pending)}
        onClick={() => void start()}
      >
        <span className={styles.providerMark} aria-hidden="true">
          {provider.slice(0, 1).toUpperCase()}
        </span>
        {t("login.oidcContinue", { provider })}
      </button>
      <Status className={styles.note} message={pending ? t("login.oidcPending", { provider }) : ""} />
      {pending && (
        <p className={styles.note}>
          {blocked && (
            <>
              <a href={pending.url} target="_blank" rel="noopener noreferrer" className={styles.tvLink}>
                {t("login.oidcOpen", { provider })}
              </a>{" "}
              ·{" "}
            </>
          )}
          <button type="button" className={styles.textButton} onClick={cancel}>
            {t("common.cancel")}
          </button>
        </p>
      )}
      {error && <Alert>{error}</Alert>}
    </>
  );
}
