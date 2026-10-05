import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead } from "../../../features/admin/ui";
import { ServerService } from "../../../gen/laterna/v1/server_pb";
import { type OidcProvider, type Settings, SystemService } from "../../../gen/laterna/v1/system_pb";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Field } from "../../../ui/Field";
import { Status } from "../../../ui/Status";
import { Switch } from "../../../ui/Switch";

export const Route = createFileRoute("/_app/admin/authentication")({
  component: Authentication,
});

/**
 * Authentication (server: docs/design/accounts.md): password, passkeys, OpenID Connect and device
 * login for TVs (approval page under the web client's address, otherwise under the public address).
 */
function Authentication() {
  const { t } = useTranslation();
  const info = useQuery(ServerService.method.getServerInfo, {}).data;
  const settings = useQuery(SystemService.method.getSettings, {});
  const oidc = useQuery(SystemService.method.getOidcProvider, {});
  // The server gives TVs the approval page under this address; without it, the code alone.
  const web = settings.data?.settings?.webUrl || settings.data?.settings?.publicUrl || "";
  return (
    <>
      <AdminHead title={t("adminAuth.title")} sub={t("adminAuth.subtitle")} />
      <div className={styles.grid3}>
        <Method
          name={t("adminAuth.password")}
          text={t("adminAuth.passwordText")}
          state={t("adminAuth.always")}
          on
        />
        <Method
          name={t("adminAuth.passkeys")}
          text={t("adminAuth.passkeysText")}
          state={info?.passkeys ? t("adminAuth.available") : t("adminAuth.needsAddress")}
          on={Boolean(info?.passkeys)}
        />
        <Method
          name={t("adminAuth.oidc")}
          text={t("adminAuth.oidcText")}
          state={
            info?.oidcProvider
              ? t("adminAuth.providerName", { name: info.oidcProvider })
              : oidc.data?.provider?.issuer
                ? t("adminAuth.needsAddress")
                : t("adminAuth.notSet")
          }
          on={Boolean(info?.oidcProvider)}
        />
      </div>
      {settings.isError && <Alert>{errorMessage(settings.error)}</Alert>}
      <div className={styles.grid2}>
        <div className={styles.stack}>
          {settings.data?.settings && <PublicAddress settings={settings.data.settings} />}
          {oidc.data && <OidcForm provider={oidc.data.provider} />}
        </div>
        <section className={styles.card} aria-labelledby="tv">
          <h2 id="tv" className={styles.cardTitle}>
            {t("adminAuth.tv")}
          </h2>
          <p>
            {web ? (
              <Trans
                i18nKey="adminAuth.tvText"
                values={{ address: `${web.replace(/\/$/, "")}/device` }}
                components={{ strong: <strong /> }}
              />
            ) : (
              t("adminAuth.tvNoAddress")
            )}
          </p>
          <p className={styles.muted}>{t("adminAuth.tvAlways")}</p>
        </section>
      </div>
    </>
  );
}

function Method({ name, text, state, on }: { name: string; text: string; state: string; on: boolean }) {
  return (
    <div className={styles.methodCard}>
      <span className={styles.methodName}>{name}</span>
      <span className={styles.muted}>{text}</span>
      <span>
        <span className={styles.pill} data-tone={on ? "ok" : undefined}>
          {state}
        </span>
      </span>
    </div>
  );
}

/**
 * Public address, web client address, passkey identifier and allowed origins (applied without
 * restart).
 */
function PublicAddress({ settings: s }: { settings: Settings }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [url, setUrl] = useState(s.publicUrl);
  const [webUrl, setWebUrl] = useState(s.webUrl);
  const [rpId, setRpId] = useState(s.passkeyRpId);
  const [origins, setOrigins] = useState(s.passkeyOrigins.join("\n"));
  const [saved, setSaved] = useState(false);
  const list = origins
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);
  const changed =
    url.trim() !== s.publicUrl ||
    webUrl.trim() !== s.webUrl ||
    rpId.trim() !== s.passkeyRpId ||
    list.join("\n") !== s.passkeyOrigins.join("\n");
  const update = useMutation(SystemService.method.updateSettings, {
    onSuccess: async () => {
      // Whether passkeys and OIDC are available is announced by GetServerInfo.
      await invalidate(SystemService, ServerService);
      setSaved(true);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    update.mutate({
      publicUrl: url.trim() !== s.publicUrl ? url.trim() : undefined,
      webUrl: webUrl.trim() !== s.webUrl ? webUrl.trim() : undefined,
      passkeyRpId: rpId.trim() !== s.passkeyRpId ? rpId.trim() : undefined,
      passkeyOrigins: list.join("\n") !== s.passkeyOrigins.join("\n") ? { values: list } : undefined,
    });
  };
  return (
    <section className={styles.card} aria-labelledby="address">
      <h2 id="address" className={styles.cardTitle}>
        {t("adminAuth.addressTitle")}
      </h2>
      <p className={styles.muted}>{t("adminAuth.addressText")}</p>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={t("adminAuth.address")}
          placeholder="https://media.example.com"
          hint={t("adminAuth.servedFrom", { origin: window.location.origin })}
          value={url}
          onChange={(e) => {
            setSaved(false);
            setUrl(e.target.value);
          }}
        />
        <Field
          label={t("adminAuth.webUrl")}
          placeholder="https://app.example.com"
          hint={t("adminAuth.webUrlHint")}
          value={webUrl}
          onChange={(e) => {
            setSaved(false);
            setWebUrl(e.target.value);
          }}
        />
        <Field
          label={t("adminAuth.rpId")}
          placeholder="example.com"
          hint={t("adminAuth.rpIdHint")}
          value={rpId}
          onChange={(e) => {
            setSaved(false);
            setRpId(e.target.value);
          }}
        />
        <label className={styles.selectField}>
          <span className={styles.label}>{t("adminAuth.origins")}</span>
          <textarea
            className={styles.textarea}
            placeholder={"https://app.example.com\nandroid:apk-key-hash:..."}
            value={origins}
            onChange={(e) => {
              setSaved(false);
              setOrigins(e.target.value);
            }}
          />
        </label>
        {update.isError && <Alert>{errorMessage(update.error)}</Alert>}
        <Status className={styles.ok} message={saved ? t("adminAuth.addressSaved") : ""} />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={!changed || update.isPending}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** OpenID Connect provider: discovered by the server before it is saved. */
function OidcForm({ provider: p }: { provider: OidcProvider | undefined }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [name, setName] = useState(p?.name ?? "");
  const [issuer, setIssuer] = useState(p?.issuer ?? "");
  const [clientId, setClientId] = useState(p?.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [autoCreate, setAutoCreate] = useState(p?.autoCreate ?? false);
  const [done, setDone] = useState("");
  const [copied, setCopied] = useState("");
  const set = useMutation(SystemService.method.setOidcProvider, {
    onSuccess: async (res, req) => {
      await invalidate(SystemService, ServerService);
      setSecret("");
      setDone(
        req.issuer
          ? t("adminAuth.providerSaved", { name: res.provider?.name || t("adminAuth.theProvider") })
          : t("adminAuth.oidcRemoved"),
      );
      if (!req.issuer) {
        setName("");
        setIssuer("");
        setClientId("");
        setAutoCreate(false);
      }
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone("");
    set.mutate({
      issuer: issuer.trim(),
      clientId: clientId.trim(),
      clientSecret: secret,
      name: name.trim(),
      autoCreate,
    });
  };
  const callback = p?.callbackUrl ?? "";
  return (
    <section className={styles.card} aria-labelledby="oidc">
      <div className={styles.cardHead}>
        <h2 id="oidc" className={styles.cardTitle}>
          {t("adminAuth.providerTitle")}
        </h2>
        {p?.issuer && (
          <span className={styles.pill} data-tone="ok">
            {t("adminAuth.set")}
          </span>
        )}
      </div>
      <p className={styles.muted}>{t("adminAuth.trust")}</p>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.grid2Fields}>
          <Field
            label={t("adminAuth.buttonName")}
            placeholder="Authentik"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            label={t("adminAuth.issuer")}
            placeholder="https://auth.example.com/application/o/laterna/"
            required
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
          />
          <Field
            label={t("adminAuth.clientId")}
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
          <Field
            label={t("adminAuth.clientSecret")}
            type="password"
            autoComplete="off"
            placeholder={p?.hasSecret ? t("adminAuth.unchanged") : ""}
            hint={p?.hasSecret ? t("adminAuth.keepSecret") : undefined}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
        <Switch
          label={t("adminAuth.autoCreate")}
          hint={t("adminAuth.autoCreateHint")}
          on={autoCreate}
          onChange={setAutoCreate}
        />
        <div className={styles.selectField}>
          <span className={styles.label}>{t("adminAuth.callback")}</span>
          {callback ? (
            <span className={styles.copyRow}>
              <span className={styles.code}>{callback}</span>
              <button
                type="button"
                className={styles.small}
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(callback)
                    .then(() => setCopied(t("adminAuth.callbackCopied")));
                }}
              >
                {t("common.copy")}
              </button>
            </span>
          ) : (
            <span className={styles.muted}>{t("adminAuth.needAddressFirst")}</span>
          )}
          <Status className={styles.ok} message={copied} />
        </div>
        {set.isError && <Alert>{errorMessage(set.error)}</Alert>}
        <Status className={styles.ok} message={done} />
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={set.isPending || !issuer.trim() || !clientId.trim() || !name.trim()}
          >
            {t("adminAuth.trySave")}
          </Button>
          {p?.issuer && (
            <button
              type="button"
              className={styles.danger}
              disabled={set.isPending}
              onClick={() => {
                setDone("");
                set.mutate({ issuer: "" });
              }}
            >
              {t("adminAuth.removeProvider")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
