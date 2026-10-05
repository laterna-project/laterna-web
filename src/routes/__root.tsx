import { createRootRouteWithContext, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../api/errors";
import { serverInfoQuery } from "../api/queries";
import { PageFocus } from "../app/PageFocus";
import type { RouterContext } from "../app/router";
import { adoptLanguage } from "../i18n";
import { ServerThemeSync } from "../theme/ServerTheme";
import { Button } from "../ui/Button";
import { Logo } from "../ui/Logo";
import styles from "./root.module.css";

export const Route = createRootRouteWithContext<RouterContext>()({
  // Each navigation starts with the server's public state: until it is set up, everything leads to
  // the setup.
  beforeLoad: async ({ context, location }) => {
    const serverInfo = await context.queryClient.ensureQueryData(serverInfoQuery(context.transport));
    if (serverInfo.setupRequired && location.pathname !== "/setup") {
      throw redirect({ to: "/setup", search: { step: "account" } });
    }
    return { serverInfo };
  },
  component: Root,
  errorComponent: ServerDown,
  notFoundComponent: NotFound,
});

function Root() {
  const { serverInfo } = Route.useRouteContext();
  // Before any login, the server's language, if neither the device nor the browser gives one.
  useEffect(() => adoptLanguage(serverInfo.language, "server"), [serverInfo.language]);
  return (
    <>
      <PageFocus />
      <ServerThemeSync />
      <Outlet />
    </>
  );
}

function ServerDown({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <main className={styles.centered}>
      <Logo />
      <h1 className={styles.title}>{t("root.serverDown")}</h1>
      <p className={styles.text}>{errorMessage(error)}</p>
      <Button variant="primary" onClick={() => router.invalidate()}>
        {t("common.retry")}
      </Button>
    </main>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <main className={styles.centered}>
      <Logo />
      <h1 className={styles.title}>{t("root.notFound")}</h1>
      <Link to="/" className={styles.link}>
        {t("common.backHome")}
      </Link>
    </main>
  );
}
