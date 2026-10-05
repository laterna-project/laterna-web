import { timestampDate } from "@bufbuild/protobuf/wkt";
import { createClient } from "@connectrpc/connect";
import { useMutation, useQuery, useTransport } from "@connectrpc/connect-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { createPasskey, passkeyError, passkeysSupported } from "../../api/passkeys";
import { AuthService } from "../../gen/laterna/v1/auth_pb";
import { ServerService } from "../../gen/laterna/v1/server_pb";
import { locale } from "../../i18n";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Status } from "../../ui/Status";
import { relativeDay } from "../catalog/format";
import styles from "./account.module.css";

const longDate = (d: Date) =>
  new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" }).format(d);

/**
 * Passkeys of the account: sign in without a password, with a fingerprint, the face or the device's
 * PIN. Possible once the server's public address is set.
 */
export function Passkeys({ defaultName }: { defaultName: string }) {
  const { t } = useTranslation();
  const transport = useTransport();
  const invalidate = useInvalidate();
  const available = useQuery(ServerService.method.getServerInfo, {}).data?.passkeys ?? false;
  const list = useQuery(AuthService.method.listPasskeys, {}, { enabled: available });
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState("");
  const remove = useMutation(AuthService.method.deletePasskey, { onSuccess: () => invalidate(AuthService) });
  const supported = passkeysSupported();

  const add = async () => {
    setError("");
    setAdded("");
    setBusy(true);
    try {
      const auth = createClient(AuthService, transport);
      const begin = await auth.beginPasskeyRegistration({});
      const credentialJson = await createPasskey(begin.optionsJson);
      const done = await auth.finishPasskeyRegistration({
        registrationId: begin.registrationId,
        credentialJson,
        name: name.trim(),
      });
      setAdded(t("passkeys.added", { name: done.passkey?.name ?? name }));
      await invalidate(AuthService);
    } catch (err) {
      setError(passkeyError(err) ?? errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const keys = list.data?.passkeys ?? [];
  return (
    <section className={styles.card} aria-labelledby="passkeys">
      <div className={styles.actions}>
        <h2 id="passkeys" className={styles.cardTitle}>
          {t("passkeys.title")}
        </h2>
        {available && <span className={styles.here}>{t("passkeys.recommended")}</span>}
      </div>
      <p className={styles.hint}>{t("passkeys.intro")}</p>
      {!available ? (
        <p>{t("passkeys.unavailable")}</p>
      ) : (
        <>
          {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
          {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
          {keys.length > 0 && (
            <ul className={styles.devices}>
              {keys.map((k) => (
                <li key={k.id} className={styles.device}>
                  <span className={styles.deviceKind} aria-hidden="true">
                    <Icon name="key" size={20} />
                  </span>
                  <span className={styles.deviceText}>
                    <span className={styles.deviceName}>{k.name}</span>
                    <span className={styles.deviceSub}>
                      {[
                        k.createdAt && t("passkeys.addedOn", { date: longDate(timestampDate(k.createdAt)) }),
                        k.lastUsedAt
                          ? t("passkeys.usedWhen", { when: relativeDay(timestampDate(k.lastUsedAt)) })
                          : t("passkeys.neverUsed"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.small}
                    disabled={remove.isPending}
                    aria-label={t("passkeys.removeLabel", { name: k.name })}
                    onClick={() => remove.mutate({ passkeyId: k.id })}
                  >
                    {t("common.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list.isSuccess && keys.length === 0 && <p className={styles.hint}>{t("passkeys.none")}</p>}
          {supported ? (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <div className={styles.grid}>
                <Field
                  label={t("passkeys.name")}
                  hint={t("passkeys.nameHint")}
                  maxLength={64}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {error && <Alert>{error}</Alert>}
              <Status className={styles.ok} message={added} />
              <div className={styles.actions}>
                <Button type="submit" variant="primary" disabled={busy || keys.length >= 20}>
                  {busy ? t("passkeys.waiting") : t("passkeys.add")}
                </Button>
                {keys.length >= 20 && <span className={styles.hint}>{t("passkeys.max")}</span>}
              </div>
            </form>
          ) : (
            <p className={styles.hint}>{t("passkeys.unsupported")}</p>
          )}
        </>
      )}
    </section>
  );
}
