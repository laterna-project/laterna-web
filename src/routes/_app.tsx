import { Code, ConnectError } from "@connectrpc/connect";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { endSession } from "../api/auth";
import { useServerEvents } from "../api/events";
import { catalogLibrariesQuery, sessionQuery } from "../api/queries";
import { sessionToken } from "../api/session";
import { SkipLink } from "../app/PageFocus";
import { restricted } from "../features/account/parental";
import { NotificationsBell, usePushClicks, usePushSync } from "../features/notifications/ui";
import { AuthService } from "../gen/laterna/v1/auth_pb";
import { CatalogService } from "../gen/laterna/v1/catalog_pb";
import { LibraryKind } from "../gen/laterna/v1/library_pb";
import { ProfileService } from "../gen/laterna/v1/profile_pb";
import { RequestService } from "../gen/laterna/v1/request_pb";
import { adoptLanguage } from "../i18n";
import { MiniPlayer } from "../music/MiniPlayer";
import { MusicProvider, useMusic } from "../music/MusicProvider";
import { ProfileThemeSync } from "../theme/ServerTheme";
import { Avatar, profileUniverse } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import styles from "./app.module.css";

// Part of the app reserved for a signed-in device with a chosen profile.
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    if (sessionToken() === null) throw redirect({ to: "/login" });
    try {
      const { session } = await context.queryClient.ensureQueryData(sessionQuery(context.transport));
      if (!session?.profile) throw redirect({ to: "/profiles" });
      await context.queryClient.ensureQueryData(catalogLibrariesQuery(context.transport));
      return { session, profile: session.profile };
    } catch (err) {
      if (err instanceof ConnectError && err.code === Code.Unauthenticated) throw redirect({ to: "/login" });
      throw err;
    }
  },
  component: AppShell,
});

/** Sections of the main navigation; each shows only if the profile has a library of that kind. */
const sections = [
  { to: "/", label: "nav.home", kinds: [], universe: undefined, icon: "home" },
  // Recommendations: movies and series only (server: docs/design/home.md).
  {
    to: "/discover",
    label: "nav.discover",
    kinds: [LibraryKind.MOVIES, LibraryKind.SHOWS],
    universe: undefined,
    icon: "discover",
  },
  { to: "/movies", label: "nav.movies", kinds: [LibraryKind.MOVIES], universe: "movies", icon: "film" },
  { to: "/series", label: "nav.series", kinds: [LibraryKind.SHOWS], universe: "series", icon: "tv" },
  { to: "/music", label: "nav.music", kinds: [LibraryKind.MUSIC], universe: "music", icon: "music" },
  { to: "/bookshelf", label: "nav.books", kinds: [LibraryKind.BOOKS], universe: "books", icon: "book" },
  { to: "/photos", label: "nav.photos", kinds: [LibraryKind.PHOTOS], universe: "photos", icon: "photo" },
] as const;

type Section = (typeof sections)[number];

function AppShell() {
  const { profile } = Route.useRouteContext();
  // The profile's language follows it from one device to another: taken if the device chose
  // nothing.
  useEffect(() => adoptLanguage(profile.language, "profile"), [profile.language]);
  // One music player per profile: switching profiles starts from an empty queue.
  return (
    <MusicProvider key={profile.id} profileId={profile.id}>
      <ProfileThemeSync key={profile.id} />
      <Shell />
    </MusicProvider>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { profile, session } = Route.useRouteContext();
  const music = useMusic();
  const navigate = useNavigate();
  // The player takes the whole screen: no header and no app shortcuts. The administration has its
  // own sidebar (the music player stays).
  const playing = useLocation({ select: (l) => l.pathname.startsWith("/play/") });
  const admin = useLocation({ select: (l) => l.pathname === "/admin" || l.pathname.startsWith("/admin/") });
  // Section shown ("movies", "music"...), for themes: [data-ui="main"][data-page="movies"].
  const page = useLocation({ select: (l) => l.pathname.split("/")[1] || "home" });
  useServerEvents(profile.id);
  usePushSync();
  usePushClicks();
  const kinds = new Set(
    (useQuery(CatalogService.method.listCatalogLibraries, {}).data?.libraries ?? []).map((l) => l.kind),
  );
  const shown = sections.filter((s) => s.kinds.length === 0 || s.kinds.some((k) => kinds.has(k)));
  // Requests show once an administrator has set where they land, unless the account may not make any.
  const account = session.account;
  const mayRequest = !account?.denyRequests || Boolean(account.isAdmin);
  const destinations = useQuery(RequestService.method.listRequestDestinations, {}, { enabled: mayRequest });
  const moreShown = more.filter(
    (m) => m.to !== "/requests" || (mayRequest && (destinations.data?.destinations.length ?? 0) > 0),
  );

  // "/" opens the search, except while typing.
  useEffect(() => {
    if (playing || admin) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      void navigate({ to: "/search" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate, playing, admin]);
  if (playing) return <Outlet />;
  if (admin)
    return (
      <>
        <Outlet />
        <MiniPlayer />
      </>
    );
  return (
    <div className={styles.shell} data-ui="app">
      <SkipLink />
      <header className={styles.header} data-ui="header">
        <Link to="/" className={styles.home} aria-label={t("nav.homeLink")} data-ui="home-link">
          <Logo />
        </Link>
        <nav aria-label={t("nav.main")} className={styles.nav} data-ui="nav">
          {shown.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className={styles.navLink}
              data-ui="nav-link"
              data-universe={s.universe}
              activeProps={{ "aria-current": "page" }}
              activeOptions={{ exact: s.to === "/" }}
            >
              {s.universe && (
                <span className={styles.navDot} style={{ background: `var(--color-${s.universe})` }} />
              )}
              {t(s.label)}
            </Link>
          ))}
          <MoreMenu items={moreShown} />
        </nav>
        <div className={styles.tools} data-ui="header-tools">
          <Link
            to="/search"
            className={styles.search}
            aria-keyshortcuts="/"
            aria-label={t("nav.search")}
            data-ui="search-button"
          >
            <Icon name="search" />
            <span className={styles.searchText}>{t("nav.search")}</span>
            <kbd className={styles.kbd}>/</kbd>
          </Link>
          <NotificationsBell />
          <ProfileMenu
            name={profile.name}
            id={profile.id}
            account={session.account?.username ?? ""}
            admin={Boolean(session.account?.isAdmin) && !restricted(profile)}
          />
        </div>
      </header>
      <main
        id="content"
        className={styles.main}
        data-ui="main"
        data-page={page}
        data-music={music.current ? "true" : undefined}
      >
        <Outlet />
      </main>
      <TabBar sections={shown} more={moreShown} />
      <MiniPlayer />
    </div>
  );
}

/** More sections: collections, playlists, watch parties, requests ("More" in the navigation). */
const more = [
  { to: "/collections", label: "nav.collections", universe: "collections" },
  { to: "/playlists", label: "nav.lists", universe: "playlists" },
  { to: "/party", label: "nav.party", universe: "party" },
  { to: "/requests", label: "nav.requests", universe: "movies" },
] as const;

type More = (typeof more)[number];

/**
 * Panel that opens under a button (disclosure pattern): it closes on an outside click, when focus
 * leaves it, and on Escape, which gives focus back to the button.
 */
function useDisclosure() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);
  return { open, setOpen, ref, button };
}

function MoreMenu({ items }: { items: readonly More[] }) {
  const { t } = useTranslation();
  const { open, setOpen, ref, button } = useDisclosure();
  const here = useLocation({ select: (l) => items.some((m) => l.pathname.startsWith(m.to)) });
  return (
    <div className={styles.menu} ref={ref}>
      <button
        ref={button}
        type="button"
        className={styles.navLink}
        data-ui="nav-more"
        aria-expanded={open}
        aria-controls="menu-more"
        aria-current={here ? "page" : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {t("nav.more")}
        <span className={styles.chevron} data-open={open}>
          <Icon name="chevron" size={14} />
        </span>
      </button>
      {open && (
        <div id="menu-more" className={styles.morePanel} data-ui="menu">
          {items.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className={styles.menuItem}
              data-ui="menu-item"
              data-universe={m.universe}
              onClick={() => setOpen(false)}
            >
              <span className={styles.navDot} style={{ background: `var(--color-${m.universe})` }} />
              {t(m.label)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Phones and tablets held upright: the sections in a bar at the bottom of the screen, within reach
 * of the thumb, instead of the header's. Tablets show them all; phones only the first four, the
 * others (data-extra) moving under "More", with collections, playlists and watch parties.
 */
function TabBar({ sections, more }: { sections: readonly Section[]; more: readonly More[] }) {
  const { t } = useTranslation();
  const { open, setOpen, ref, button } = useDisclosure();
  const extra = sections.slice(4);
  const inMore = useLocation({ select: (l) => more.some((m) => l.pathname.startsWith(m.to)) });
  const inExtra = useLocation({ select: (l) => extra.some((m) => l.pathname.startsWith(m.to)) });
  return (
    <nav aria-label={t("nav.main")} className={styles.tabBar} data-ui="tab-bar">
      {sections.map((s, i) => (
        <Link
          key={s.to}
          to={s.to}
          className={styles.tab}
          data-ui="tab-bar-link"
          data-universe={s.universe}
          data-extra={i >= 4 || undefined}
          activeProps={{ "aria-current": "page" }}
          activeOptions={{ exact: s.to === "/" }}
        >
          <span className={styles.tabIcon}>
            <Icon name={s.icon} size={22} />
          </span>
          <span className={styles.tabLabel}>{t(s.label)}</span>
        </Link>
      ))}
      <div className={styles.tabMenu} ref={ref}>
        <button
          ref={button}
          type="button"
          className={styles.tab}
          data-ui="tab-bar-more"
          aria-expanded={open}
          aria-controls="menu-tabs"
          aria-current={inMore ? "page" : undefined}
          data-holds-extra={inExtra || undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.tabIcon}>
            <Icon name="more" size={22} />
          </span>
          <span className={styles.tabLabel}>{t("nav.more")}</span>
        </button>
        {open && (
          <div id="menu-tabs" className={styles.tabPanel} data-ui="menu">
            {[...extra, ...more].map((m, i) => (
              <Link
                key={m.to}
                to={m.to}
                className={styles.menuItem}
                data-ui="menu-item"
                data-universe={m.universe}
                data-extra={i < extra.length || undefined}
                activeProps={{ "aria-current": "page" }}
                onClick={() => setOpen(false)}
              >
                {m.universe && (
                  <span className={styles.navDot} style={{ background: `var(--color-${m.universe})` }} />
                )}
                {t(m.label)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

function ProfileMenu({
  name,
  id,
  account,
  admin,
}: {
  name: string;
  id: string;
  account: string;
  admin: boolean;
}) {
  const { t } = useTranslation();
  const { open, setOpen, ref, button } = useDisclosure();
  const profileIds = (useQuery(ProfileService.method.listProfiles, {}).data?.profiles ?? []).map((p) => p.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation(AuthService.method.logout, {
    onSettled: async () => {
      endSession(queryClient);
      await navigate({ to: "/login" });
    },
  });

  return (
    <div className={styles.menu} ref={ref}>
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        data-ui="profile-button"
        aria-expanded={open}
        aria-controls="menu-profile"
        aria-label={t("nav.profile", { name })}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={name} universe={profileUniverse(profileIds, id)} size="sm" />
      </button>
      {open && (
        <div id="menu-profile" className={styles.menuPanel} data-ui="menu">
          <p className={styles.menuWho}>
            <span className={styles.menuName}>{name}</span>
            <span className={styles.menuAccount}>{t("nav.account", { name: account })}</span>
          </p>
          <Link to="/account" className={styles.menuItem} data-ui="menu-item" onClick={() => setOpen(false)}>
            {t("nav.myAccount")}
          </Link>
          <Link to="/offline" className={styles.menuItem} data-ui="menu-item" onClick={() => setOpen(false)}>
            {t("nav.downloads")}
          </Link>
          {admin && (
            <Link to="/admin" className={styles.menuItem} data-ui="menu-item" onClick={() => setOpen(false)}>
              {t("nav.admin")}
            </Link>
          )}
          <Link to="/profiles" className={styles.menuItem} data-ui="menu-item">
            {t("nav.switchProfile")}
          </Link>
          <button
            type="button"
            className={styles.menuItem}
            data-ui="menu-item"
            onClick={() => logout.mutate({})}
            disabled={logout.isPending}
          >
            {t("nav.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
