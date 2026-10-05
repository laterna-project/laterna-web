import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { deviceName } from "../../../api/device";
import styles from "../../../features/account/account.module.css";
import { PasswordForm } from "../../../features/account/Devices";
import { Passkeys } from "../../../features/account/Passkeys";
import { Icon } from "../../../ui/Icon";

export const Route = createFileRoute("/_app/account/security")({
  beforeLoad: ({ context }) => {
    if (context.profile.kid) throw redirect({ to: "/account" });
  },
  component: Security,
});

/** Security: passkeys, password, devices paired with a code. */
function Security() {
  const { t } = useTranslation();
  const { session } = Route.useRouteContext();
  return (
    <>
      <div className={styles.head} data-ui="page-header">
        <h1 className={styles.title}>{t("security.title")}</h1>
        <p className={styles.subtitle}>{t("security.subtitle", { name: session.account?.username })}</p>
      </div>
      <div className={styles.columns}>
        <Passkeys defaultName={deviceName()} />
        <div className={styles.stack}>
          <PasswordForm />
          <section className={styles.card} aria-labelledby="pair">
            <div className={styles.actions}>
              <h2 id="pair" className={styles.cardTitle}>
                {t("security.pairedTitle")}
              </h2>
            </div>
            <p className={styles.hint}>{t("security.pairedText")}</p>
            <div className={styles.actions}>
              <Link to="/device" className={styles.small}>
                <Icon name="tv" size={16} />
                {t("security.pair")}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
