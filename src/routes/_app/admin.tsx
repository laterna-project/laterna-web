import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SkipLink } from "../../app/PageFocus";
import { restricted } from "../../features/account/parental";
import styles from "../../features/admin/admin.module.css";
import { AccountService } from "../../gen/laterna/v1/account_pb";
import { ActivityService } from "../../gen/laterna/v1/activity_pb";
import { LibraryService } from "../../gen/laterna/v1/library_pb";
import { RequestService, RequestStatus } from "../../gen/laterna/v1/request_pb";
import { SystemService } from "../../gen/laterna/v1/system_pb";
import { useMusic } from "../../music/MusicProvider";
import { Icon } from "../../ui/Icon";
import { Logo } from "../../ui/Logo";

// Server administration: for administrators only (the server checks too).
export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    if (!context.session.account?.isAdmin) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

/** Sections of the administration, each with its color. */
const menu = [
  { to: "/admin", label: "adminNav.overview", dot: "var(--color-ink)" },
  { to: "/admin/libraries", label: "adminNav.libraries", dot: "var(--color-collections)" },
  { to: "/admin/accounts", label: "adminNav.accounts", dot: "var(--color-playlists)" },
  { to: "/admin/requests", label: "adminNav.requests", dot: "var(--color-movies)" },
  { to: "/admin/authentication", label: "adminNav.authentication", dot: "var(--color-series)" },
  { to: "/admin/themes", label: "adminNav.themes", dot: "var(--color-accent)" },
  { to: "/admin/devices", label: "adminNav.devices", dot: "var(--color-party)" },
  { to: "/admin/activity", label: "adminNav.activity", dot: "var(--color-music)" },
  { to: "/admin/tasks", label: "adminNav.tasks", dot: "var(--color-danger)" },
  { to: "/admin/logs", label: "adminNav.logs", dot: "var(--color-line-strong)" },
  { to: "/admin/observability", label: "adminNav.observability", dot: "var(--color-music)" },
  { to: "/admin/sonarr-radarr", label: "adminNav.arr", dot: "var(--color-series)" },
  { to: "/admin/jellyfin-import", label: "adminNav.jellyfin", dot: "var(--color-movies)" },
  { to: "/admin/backups", label: "adminNav.backups", dot: "var(--color-books)" },
  { to: "/admin/settings", label: "adminNav.settings", dot: "var(--color-line-strong)" },
] as const;

function AdminLayout() {
  const { t } = useTranslation();
  const { profile } = Route.useRouteContext();
  const music = useMusic();
  const allowed = !restricted(profile);
  const enabled = { enabled: allowed };
  // Narrow screens: the menu folds under a button that names the section shown.
  const [open, setOpen] = useState(false);
  const current = useLocation({
    select: (l) => menu.find((m) => (m.to === "/admin" ? l.pathname === m.to : l.pathname.startsWith(m.to))),
  });
  const badges: Partial<Record<(typeof menu)[number]["to"], number>> = {
    "/admin/libraries": useQuery(LibraryService.method.listLibraries, {}, enabled).data?.libraries.length,
    "/admin/accounts": useQuery(AccountService.method.listAccounts, {}, enabled).data?.accounts.length,
    "/admin/requests": useQuery(
      RequestService.method.listRequests,
      { statuses: [RequestStatus.PENDING], pageSize: 1 },
      enabled,
    ).data?.pendingCount,
    "/admin/devices": useQuery(ActivityService.method.listDevices, {}, enabled).data?.devices.length,
    "/admin/tasks": useQuery(SystemService.method.getSystemStatus, {}, enabled).data?.status?.jobsFailed,
  };

  return (
    <div className={styles.admin} data-music={music.current ? "true" : undefined} data-ui="admin">
      <SkipLink />
      <header className={styles.side} data-ui="admin-side">
        <Link to="/admin" className={styles.brand} aria-label={t("adminNav.brand")}>
          <Logo />
          <span className={styles.brandSub}>{t("adminNav.subtitle")}</span>
        </Link>
        {allowed && current && (
          <button
            type="button"
            className={styles.menuButton}
            data-ui="admin-menu-button"
            aria-expanded={open}
            aria-controls="admin-menu"
            aria-label={t("adminNav.menu", { section: t(current.label) })}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={styles.menuDot} style={{ background: current.dot }} />
            {t(current.label)}
            <span className={styles.spacer} />
            <span className={styles.chevron} data-open={open}>
              <Icon name="chevron" size={14} />
            </span>
          </button>
        )}
        {allowed && (
          <nav
            id="admin-menu"
            aria-label={t("adminNav.label")}
            className={styles.menu}
            data-open={open}
            data-ui="nav"
          >
            {menu.map((m) => (
              <Link
                key={m.to}
                to={m.to}
                className={styles.menuLink}
                data-ui="nav-link"
                activeProps={{ "aria-current": "page" }}
                activeOptions={{ exact: m.to === "/admin" }}
                onClick={() => setOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <span className={styles.menuDot} style={isActive ? undefined : { background: m.dot }} />
                    {t(m.label)}
                    <span className={styles.spacer} />
                    {Boolean(badges[m.to]) && (
                      <span
                        className={styles.menuBadge}
                        data-tone={m.to === "/admin/tasks" ? "danger" : undefined}
                      >
                        {badges[m.to]}
                      </span>
                    )}
                  </>
                )}
              </Link>
            ))}
          </nav>
        )}
        <span className={styles.spacer} />
        <Link to="/" className={styles.back}>
          {t("common.backHome")}
        </Link>
      </header>
      <main id="content" className={styles.main} data-ui="main" data-page="admin">
        {allowed ? (
          <Outlet />
        ) : (
          <section className={styles.card}>
            <h1 className={styles.cardTitle}>{t("adminNav.restrictedTitle")}</h1>
            <p>{t("adminNav.restrictedText")}</p>
            <div className={styles.actions}>
              <Link to="/profiles" className={styles.dark}>
                {t("nav.switchProfile")}
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
