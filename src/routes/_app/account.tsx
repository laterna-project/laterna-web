import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import styles from "../../features/account/account.module.css";

export const Route = createFileRoute("/_app/account")({
  component: AccountLayout,
});

/** Sections of "My account". */
const tabs = [
  { to: "/account", label: "account.tabProfiles", account: true },
  { to: "/account/security", label: "account.tabSecurity", account: true },
  { to: "/account/stats", label: "account.tabStats", account: false },
  { to: "/account/history", label: "account.tabHistory", account: false },
] as const;

function AccountLayout() {
  const { t } = useTranslation();
  const { profile } = Route.useRouteContext();
  return (
    <div className={styles.page}>
      <nav aria-label={t("account.tabs")} className={styles.tabs} data-ui="tabs">
        {tabs
          // Account security is not managed from a kid profile.
          .filter((tab) => !(tab.to === "/account/security" && profile.kid))
          .map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className={styles.tab}
              data-ui="tab"
              activeProps={{ "aria-current": "page" }}
              activeOptions={{ exact: tab.to === "/account" }}
            >
              {t(tab.label)}
            </Link>
          ))}
      </nav>
      <Outlet />
    </div>
  );
}
