import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import styles from "../../../features/account/account.module.css";
import { Devices } from "../../../features/account/Devices";
import { LanguagePicker } from "../../../features/account/LanguagePicker";
import { ProfileEditor } from "../../../features/account/ProfileEditor";
import { ProfileTheme } from "../../../features/account/ProfileTheme";
import { SubtitlePicker } from "../../../features/account/SubtitlePicker";
import { ThemePicker } from "../../../features/account/ThemePicker";
import { ProfileService } from "../../../gen/laterna/v1/profile_pb";

export const Route = createFileRoute("/_app/account/")({
  component: Account,
});

/** My account: appearance, profiles, devices. */
function Account() {
  const { t } = useTranslation();
  const { session, profile } = Route.useRouteContext();
  const count = useQuery(ProfileService.method.listProfiles, {}).data?.profiles.length ?? 0;
  const account = session.account;
  return (
    <>
      <div className={styles.head} data-ui="page-header">
        <h1 className={styles.title}>{t("account.title")}</h1>
        <p className={styles.subtitle}>
          {[
            account?.username,
            account?.isAdmin ? t("account.admin") : "",
            count ? t("account.profiles", { count }) : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {/* Two columns that each stack on their own side: cards of different heights leave no gap, as rows would. */}
      <div className={styles.columns}>
        <div className={styles.stack}>
          <ProfileTheme />
          {profile.kid ? (
            <section className={styles.card}>
              <p>{t("account.kidProfile")}</p>
            </section>
          ) : (
            <ProfileEditor currentId={profile.id} />
          )}
        </div>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="language">
            <h2 id="language" className={styles.cardTitle}>
              {t("language.title")}
            </h2>
            <LanguagePicker hint profile />
          </section>
          <section className={styles.card} aria-labelledby="subtitles">
            <h2 id="subtitles" className={styles.cardTitle}>
              {t("subtitlePrefs.title")}
            </h2>
            <SubtitlePicker />
          </section>
          <ThemePicker />
          {!profile.kid && <Devices />}
        </div>
      </div>
    </>
  );
}
