import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { startSession } from "../api/auth";
import { currentDevice, deviceName, saveDeviceName } from "../api/device";
import { errorMessage } from "../api/errors";
import { sessionToken } from "../api/session";
import { LanguagePicker } from "../features/account/LanguagePicker";
import { libraryKinds, metadataLanguages, metadataTag } from "../features/admin/admin";
import { BrowseButton } from "../features/admin/FolderPicker";
import { AuthService } from "../gen/laterna/v1/auth_pb";
import { IntegrationKind, IntegrationService } from "../gen/laterna/v1/integration_pb";
import { CreateLibraryRequestSchema, LibraryKind, LibraryService } from "../gen/laterna/v1/library_pb";
import { ProfileService } from "../gen/laterna/v1/profile_pb";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Logo } from "../ui/Logo";
import styles from "./setup.module.css";

const steps = [
  { id: "account", label: "setup.steps.account" },
  { id: "libraries", label: "setup.steps.libraries" },
  { id: "integrations", label: "setup.steps.integrations" },
  { id: "ready", label: "setup.steps.ready" },
] as const;
type Step = (typeof steps)[number]["id"];

export const Route = createFileRoute("/setup")({
  validateSearch: (search: Record<string, unknown>): { step: Step } => {
    const step = steps.find((s) => s.id === search.step)?.id ?? "account";
    return { step };
  },
  beforeLoad: ({ context, search }) => {
    // Server to set up: everything starts with the account. Already set up: the next steps stay
    // open to the device that just set it up (it is signed in).
    if (context.serverInfo.setupRequired) {
      if (search.step !== "account") throw redirect({ to: "/setup", search: { step: "account" } });
    } else if (sessionToken() === null) {
      throw redirect({ to: "/login" });
    } else if (search.step === "account") {
      throw redirect({ to: "/setup", search: { step: "libraries" } });
    }
  },
  component: Installation,
});

function Installation() {
  const { t } = useTranslation();
  const { step } = Route.useSearch();
  const current = steps.findIndex((s) => s.id === step);
  return (
    <div className={styles.page} data-ui="entry" data-page="setup">
      <header className={styles.header}>
        <span className={styles.brand}>
          <Logo />
          <span className={styles.subtitle}>{t("setup.subtitle")}</span>
        </span>
        <ol className={styles.steps}>
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={styles.step}
              data-state={i < current ? "done" : i === current ? "now" : "todo"}
              aria-current={i === current ? "step" : undefined}
            >
              <span className={styles.stepMark}>{i < current ? "✓" : i + 1}</span>
              {t(s.label)}
            </li>
          ))}
        </ol>
        <LanguagePicker inline />
      </header>
      {step === "account" && <AccountStep />}
      {step === "libraries" && <LibrariesStep />}
      {step === "integrations" && <IntegrationsStep />}
      {step === "ready" && <ReadyStep />}
    </div>
  );
}

function AccountStep() {
  const { t } = useTranslation();
  const { transport } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [device, setDevice] = useState(deviceName);
  const mismatch = confirm !== "" && confirm !== password;
  const setup = useMutation(AuthService.method.setup, {
    onSuccess: async (res) => {
      saveDeviceName(device);
      startSession(queryClient, res.token);
      // The administration needs a chosen profile: the one created with the account.
      if (!res.session?.profile) {
        const profiles = createClient(ProfileService, transport);
        const first = (await profiles.listProfiles({})).profiles[0];
        if (first) await profiles.selectProfile({ profileId: first.id });
      }
      await navigate({ to: "/setup", search: { step: "libraries" } });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mismatch) setup.mutate({ username, password, device: currentDevice(device) });
  };
  return (
    <main className={styles.single}>
      <section className={styles.card}>
        <h1 className={styles.title}>{t("setup.welcome")}</h1>
        <p className={styles.lead}>{t("setup.welcomeLead")}</p>
        <form className={styles.form} onSubmit={submit}>
          <Field
            label={t("entry.username")}
            autoComplete="username"
            autoCapitalize="none"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            label={t("entry.password")}
            type="password"
            autoComplete="new-password"
            minLength={8}
            hint={t("password.tooShort")}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label={t("setup.confirmPassword")}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            error={mismatch ? t("setup.mismatch") : undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Field
            label={t("entry.deviceName")}
            required
            value={device}
            onChange={(e) => setDevice(e.target.value)}
          />
          {setup.isError && <Alert>{errorMessage(setup.error)}</Alert>}
          <Button type="submit" variant="primary" size="lg" disabled={setup.isPending || mismatch}>
            {t("setup.createAccount")}
          </Button>
        </form>
      </section>
    </main>
  );
}

function LibrariesStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const libraries = useQuery(LibraryService.method.listLibraries, {});
  const [name, setName] = useState("");
  const [kind, setKind] = useState(LibraryKind.MOVIES);
  // Folders typed in, each with a stable key for the list.
  const [paths, setPaths] = useState([{ key: 0, value: "" }]);
  const [nextKey, setNextKey] = useState(1);
  // Metadata in the interface language by default.
  const [language, setLanguage] = useState(metadataTag);
  const add = useMutation(LibraryService.method.createLibrary, {
    onSuccess: async () => {
      setName("");
      setPaths([{ key: 0, value: "" }]);
      await libraries.refetch();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(
      create(CreateLibraryRequestSchema, {
        name,
        kind,
        paths: paths.map((p) => p.value.trim()).filter(Boolean),
        language,
      }),
    );
  };
  const list = libraries.data?.libraries ?? [];

  return (
    <main className={styles.split}>
      <section className={styles.card}>
        <h1 className={styles.title}>{t("setup.librariesTitle")}</h1>
        <p className={styles.lead}>{t("setup.librariesLead")}</p>
        <form className={styles.form} onSubmit={submit}>
          <Field
            label={t("libraryEditor.name")}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <fieldset className={styles.kinds}>
            <legend className={styles.legend}>{t("libraryEditor.content")}</legend>
            {libraryKinds.map((k) => (
              <button
                key={k.kind}
                type="button"
                className={styles.kind}
                aria-pressed={kind === k.kind}
                style={
                  kind === k.kind
                    ? { background: `var(--color-${k.universe})`, color: `var(--color-${k.universe}-ink)` }
                    : undefined
                }
                onClick={() => setKind(k.kind)}
              >
                <span className={styles.kindDot} style={{ background: `var(--color-${k.universe})` }} />
                {k.label}
              </button>
            ))}
          </fieldset>
          <div className={styles.paths}>
            <span className={styles.legend}>{t("libraryEditor.folders")}</span>
            {paths.map((p, i) => (
              <span key={p.key} className={styles.path}>
                <input
                  className={styles.pathInput}
                  aria-label={t("libraryEditor.folder", { n: i + 1 })}
                  placeholder={i === 0 ? t("setup.folderPlaceholder") : ""}
                  required={i === 0}
                  value={p.value}
                  onChange={(e) =>
                    setPaths(paths.map((q) => (q.key === p.key ? { ...q, value: e.target.value } : q)))
                  }
                />
                <BrowseButton
                  value={p.value}
                  label={t("libraryEditor.browse", { n: i + 1 })}
                  onPick={(value) => setPaths(paths.map((q) => (q.key === p.key ? { ...q, value } : q)))}
                />
                {paths.length > 1 && (
                  <button
                    type="button"
                    className={styles.pathRemove}
                    aria-label={t("libraryEditor.removeFolder", { n: i + 1 })}
                    onClick={() => setPaths(paths.filter((q) => q.key !== p.key))}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            <button
              type="button"
              className={styles.addPath}
              onClick={() => {
                setPaths([...paths, { key: nextKey, value: "" }]);
                setNextKey(nextKey + 1);
              }}
            >
              {t("libraryEditor.addFolder")}
            </button>
          </div>
          <label className={styles.select}>
            <span className={styles.legend}>{t("libraryEditor.language")}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {metadataLanguages().map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {add.isError && <Alert>{errorMessage(add.error)}</Alert>}
          <Button type="submit" variant="primary" disabled={add.isPending}>
            {t("setup.addLibrary")}
          </Button>
        </form>
      </section>
      <aside className={styles.aside}>
        <section className={styles.card}>
          <h2 className={styles.subtitleTitle}>{t("setup.added")}</h2>
          {list.length === 0 ? (
            <p className={styles.muted}>{t("setup.noneYet")}</p>
          ) : (
            <ul className={styles.added}>
              {list.map((s) => {
                const k = libraryKinds.find((x) => x.kind === s.library?.kind);
                return (
                  <li key={s.library?.id} className={styles.addedItem}>
                    <span
                      className={styles.addedMark}
                      style={{ background: `var(--color-${k?.universe ?? "movies"})` }}
                    >
                      ✓
                    </span>
                    <span>
                      <span className={styles.addedName}>{s.library?.name}</span>
                      <span className={styles.muted}>
                        {k?.label} · {s.library?.paths.join(", ")}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className={styles.card}>
          <h2 className={styles.subtitleTitle}>{t("setup.goodToKnow")}</h2>
          <p className={styles.muted}>{t("setup.goodToKnowText")}</p>
        </section>
        <div className={styles.actions}>
          <Button
            variant="primary"
            onClick={() => navigate({ to: "/setup", search: { step: "integrations" } })}
          >
            {t("setup.continue")}
          </Button>
        </div>
      </aside>
    </main>
  );
}

function IntegrationsStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const next = () => navigate({ to: "/setup", search: { step: "ready" } });
  return (
    <main className={styles.single}>
      <section className={styles.card}>
        <h1 className={styles.title}>{t("setup.steps.integrations")}</h1>
        <p className={styles.lead}>{t("setup.integrationsLead")}</p>
        <div className={styles.integrations}>
          <IntegrationForm
            kind={IntegrationKind.SONARR}
            name="Sonarr"
            what={t("setup.seriesAndAnime")}
            port="8989"
          />
          <IntegrationForm kind={IntegrationKind.RADARR} name="Radarr" what={t("setup.movies")} port="7878" />
        </div>
        <div className={styles.actions}>
          <Button variant="primary" onClick={next}>
            {t("setup.continue")}
          </Button>
          <Button variant="quiet" onClick={next}>
            {t("setup.later")}
          </Button>
        </div>
      </section>
    </main>
  );
}

function IntegrationForm({
  kind,
  name,
  what,
  port,
}: {
  kind: IntegrationKind;
  name: string;
  what: string;
  port: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const link = useMutation(IntegrationService.method.setIntegration);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    link.mutate({ kind, url, apiKey });
  };
  return (
    <form className={styles.integration} onSubmit={submit}>
      <h2 className={styles.subtitleTitle}>
        {name} <span className={styles.inlineMuted}>· {what}</span>
      </h2>
      <Field
        label={t("adminArr.address")}
        placeholder={`http://localhost:${port}`}
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Field
        label={t("adminArr.apiKey")}
        hint={t("adminArr.apiKeyWhere")}
        required
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      {link.isError && <Alert>{errorMessage(link.error)}</Alert>}
      {link.isSuccess && <Alert tone="info">{t("setup.linked", { name })}</Alert>}
      <Button type="submit" disabled={link.isPending}>
        {t("setup.link", { name })}
      </Button>
    </form>
  );
}

function ReadyStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <main className={styles.single}>
      <section className={styles.card}>
        <h1 className={styles.title}>{t("setup.readyTitle")}</h1>
        <p className={styles.lead}>{t("setup.readyLead")}</p>
        <div className={styles.actions}>
          <Button variant="primary" size="lg" onClick={() => navigate({ to: "/" })}>
            {t("setup.open")}
          </Button>
        </div>
      </section>
    </main>
  );
}
