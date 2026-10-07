import { createQueryOptions, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { endSession } from "../api/auth";
import { errorMessage } from "../api/errors";
import { sessionQuery } from "../api/queries";
import { sessionToken } from "../api/session";
import { AuthService } from "../gen/laterna/v1/auth_pb";
import { type Profile, ProfileService } from "../gen/laterna/v1/profile_pb";
import { Alert } from "../ui/Alert";
import { Avatar, profileUniverse } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Logo } from "../ui/Logo";
import styles from "./profiles.module.css";

export const Route = createFileRoute("/profiles")({
  beforeLoad: () => {
    if (sessionToken() === null) throw redirect({ to: "/login" });
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(ProfileService.method.listProfiles, {}, { transport: context.transport }),
    ),
  component: Profiles,
});

function Profiles() {
  const { t } = useTranslation();
  const { serverInfo, transport } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const profiles = useQuery(ProfileService.method.listProfiles, {}).data?.profiles ?? [];
  const current = useQuery(AuthService.method.getSession, {}).data?.session?.profile;
  const [asking, setAsking] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");

  const select = useMutation(ProfileService.method.selectProfile, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQuery(transport).queryKey });
      await navigate({ to: "/" });
    },
  });
  const logout = useMutation(AuthService.method.logout, {
    onSettled: async () => {
      endSession(queryClient);
      await navigate({ to: "/login" });
    },
  });

  const choose = (p: Profile) => {
    select.reset();
    setPin("");
    if (p.hasPin) setAsking(p);
    else {
      setAsking(null);
      select.mutate({ profileId: p.id });
    }
  };
  const submitPin = (e: FormEvent) => {
    e.preventDefault();
    if (asking) select.mutate({ profileId: asking.id, pin });
  };

  return (
    <div className={styles.page} data-ui="entry" data-page="profiles">
      <header className={styles.header}>
        <Logo />
        <span className={styles.server}>
          <span>{t("profiles.server", { name: serverInfo.name })}</span>
          <Button variant="secondary" onClick={() => logout.mutate({})} disabled={logout.isPending}>
            {t("nav.signOut")}
          </Button>
        </span>
      </header>
      <main className={styles.main}>
        <h1 className={styles.title}>{t("profiles.title")}</h1>
        <p className={styles.lead}>{t("profiles.lead")}</p>
        <ul className={styles.grid}>
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={styles.profile}
                data-ui="profile-tile"
                aria-pressed={asking?.id === p.id || (!asking && current?.id === p.id)}
                aria-label={[p.name, p.hasPin && t("profiles.pinProtected"), p.kid && t("profiles.kid")]
                  .filter(Boolean)
                  .join(", ")}
                onClick={() => choose(p)}
                disabled={select.isPending}
              >
                <Avatar
                  name={p.name}
                  universe={profileUniverse(
                    profiles.map((q) => q.id),
                    p.id,
                  )}
                  size="xl"
                />
                <span className={styles.name}>{p.name}</span>
                <span className={styles.badges}>
                  {p.hasPin && <span className={styles.badge}>{t("profiles.badgeCode")}</span>}
                  {p.kid && (
                    <span className={styles.badge}>
                      {t("profiles.badgeKid")}
                      {p.parental?.maxAge !== undefined &&
                        ` · ${t("parental.years", { count: p.parental.maxAge })}`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {asking && (
          <form className={styles.pin} onSubmit={submitPin}>
            <label htmlFor="pin" className={styles.pinLabel}>
              {t("profiles.pinOf", { name: asking.name })}
            </label>
            <input
              id="pin"
              className={styles.pinInput}
              data-large
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,8}"
              minLength={4}
              maxLength={8}
              autoComplete="off"
              // biome-ignore lint/a11y/noAutofocus: the PIN is the only thing to do here
              autoFocus
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
            <span className={styles.pinHint}>{t("profiles.pinHint")}</span>
            <Button type="submit" variant="primary" disabled={select.isPending || pin.length < 4}>
              {t("profiles.open")}
            </Button>
          </form>
        )}
        {select.isError && <Alert>{errorMessage(select.error)}</Alert>}
      </main>
    </div>
  );
}
