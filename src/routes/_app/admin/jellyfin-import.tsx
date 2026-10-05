import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import { serverText } from "../../../api/text";
import { importTarget, importTargetValue, matchedShare } from "../../../features/admin/admin";
import styles from "../../../features/admin/admin.module.css";
import { BrowseButton } from "../../../features/admin/FolderPicker";
import { AdminHead } from "../../../features/admin/ui";
import { AccountService } from "../../../gen/laterna/v1/account_pb";
import { ActivityService } from "../../../gen/laterna/v1/activity_pb";
import {
  type ImportJellyfinResponse,
  ImportService,
  type JellyfinTarget,
  JellyfinTargetKind,
  type JellyfinUser,
  type PreviewJellyfinImportResponse,
} from "../../../gen/laterna/v1/import_pb";
import { ProfileService } from "../../../gen/laterna/v1/profile_pb";
import i18n, { num } from "../../../i18n";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { Status } from "../../../ui/Status";

export const Route = createFileRoute("/_app/admin/jellyfin-import")({
  component: ImportJellyfin,
});

/**
 * Import from Jellyfin (server: docs/design/jellyfin-import.md): the server reads a copy of
 * Jellyfin's data folder, proposes a target for each user, then imports watched state, positions,
 * favorites and sessions. Running it again copies nothing twice; Jellyfin is never modified.
 */
function ImportJellyfin() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<{ path: string; res: PreviewJellyfinImportResponse } | null>(null);
  const [targets, setTargets] = useState<Record<string, JellyfinTarget>>({});
  const [result, setResult] = useState<ImportJellyfinResponse | null>(null);
  const read = useMutation(ImportService.method.previewJellyfinImport, {
    onSuccess: (res, req) => {
      setPreview({ path: req.path ?? "", res });
      setTargets({});
      setResult(null);
    },
  });
  const run = useMutation(ImportService.method.importJellyfin, {
    onSuccess: async (res) => {
      setResult(res);
      // Accounts, profiles, watch data and history may have changed.
      await invalidate(AccountService, ProfileService, ActivityService);
    },
  });
  const step = result ? 3 : preview ? 2 : 1;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run.reset();
    read.mutate({ path: path.trim() });
  };

  return (
    <>
      <AdminHead title={t("jellyfin.title")} sub={t("jellyfin.subtitle")}>
        <ol className={styles.steps} aria-label={t("jellyfin.steps")}>
          {[t("jellyfin.stepSource"), t("jellyfin.stepMatches"), t("jellyfin.stepImport")].map((label, i) => (
            <li key={label} className={styles.step} aria-current={step === i + 1 ? "step" : undefined}>
              <span className={styles.stepMark}>
                {step > i + 1 ? <Icon name="check" size={14} /> : i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </AdminHead>

      <section className={styles.card} aria-labelledby="source">
        <h2 id="source" className={styles.cardTitle}>
          {t("jellyfin.source")}
        </h2>
        <p className={styles.muted}>{t("jellyfin.sourceText")}</p>
        <form className={styles.form} onSubmit={submit}>
          <span className={styles.path}>
            <input
              className={styles.input}
              aria-label={t("jellyfin.folder")}
              placeholder="/srv/jellyfin-copy/config"
              required
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <BrowseButton value={path} label={t("jellyfin.browse")} onPick={(p) => setPath(p)} />
          </span>
          {read.isError && <Alert>{errorMessage(read.error)}</Alert>}
          <div className={styles.actions}>
            <Button
              type="submit"
              variant={preview ? "secondary" : "primary"}
              disabled={!path.trim() || read.isPending}
            >
              {read.isPending ? t("jellyfin.reading") : preview ? t("jellyfin.reread") : t("jellyfin.read")}
            </Button>
          </div>
        </form>
      </section>

      {preview && (
        <Preview
          preview={preview.res}
          targets={targets}
          setTarget={(id, t) => setTargets((all) => ({ ...all, [id]: t }))}
          running={run.isPending}
          done={Boolean(result)}
          onImport={() => run.mutate({ path: preview.path, targets })}
        />
      )}
      {run.isError && <Alert>{errorMessage(run.error)}</Alert>}
      {result && <Results result={result} />}
    </>
  );
}

function Preview({
  preview: p,
  targets,
  setTarget,
  running,
  done,
  onImport,
}: {
  preview: PreviewJellyfinImportResponse;
  targets: Record<string, JellyfinTarget>;
  setTarget: (id: string, t: JellyfinTarget) => void;
  running: boolean;
  done: boolean;
  onImport: () => void;
}) {
  const { t } = useTranslation();
  const total = p.users.reduce((n, u) => n + u.userData, 0);
  const matched = p.users.reduce((n, u) => n + u.userDataMatched, 0);
  const sessions = p.users.reduce((n, u) => n + u.sessions, 0);
  return (
    <div className={styles.grid2}>
      <section className={styles.card} aria-labelledby="users">
        <h2 id="users" className={styles.cardTitle}>
          {t("jellyfin.users")}
        </h2>
        <p className={styles.muted}>{t("jellyfin.usersText")}</p>
        {p.users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            value={importTargetValue(targets[u.id] ?? u.target)}
            onChange={(v) => setTarget(u.id, importTarget(v))}
          />
        ))}
      </section>
      <section className={styles.card} aria-labelledby="preview">
        <h2 id="preview" className={styles.cardTitle}>
          {t("jellyfin.wouldImport")}
        </h2>
        <div className={styles.numbers}>
          <span className={styles.number}>
            <span className={styles.numberValue}>{matchedShare(matched, total)}</span>
            <span className={styles.muted}>{t("jellyfin.matched")}</span>
          </span>
          <span className={styles.number}>
            <span className={styles.numberValue}>{num(matched)}</span>
            <span className={styles.muted}>{t("jellyfin.data")}</span>
          </span>
          <span className={styles.number}>
            <span className={styles.numberValue}>{num(sessions)}</span>
            <span className={styles.muted}>{t("jellyfin.sessions")}</span>
          </span>
        </div>
        <ul className={styles.rows}>
          {p.unmatchedFiles > 0 && (
            <li className={styles.muted}>
              {t("jellyfin.unmatched", { count: p.unmatchedFiles })}
              {p.unmatchedSamples.length > 0 && (
                <>
                  {t("jellyfin.examples")}
                  <span className={styles.code}>{p.unmatchedSamples.slice(0, 3).join(" ; ")}</span>
                </>
              )}
            </li>
          )}
          {p.orphanedUserData > 0 && (
            <li className={styles.muted}>{t("jellyfin.orphaned", { count: p.orphanedUserData })}</li>
          )}
          {p.unsupportedUserData > 0 && (
            <li className={styles.muted}>{t("jellyfin.unsupported", { count: p.unsupportedUserData })}</li>
          )}
          {p.unpairedSessions > 0 && (
            <li className={styles.muted}>{t("jellyfin.unpaired", { count: p.unpairedSessions })}</li>
          )}
        </ul>
        <p className={styles.muted}>{t("jellyfin.again")}</p>
        <div className={styles.actions}>
          <Button variant="primary" disabled={running || done || p.users.length === 0} onClick={onImport}>
            {running ? t("jellyfin.importing") : done ? t("jellyfin.imported") : t("jellyfin.run")}
          </Button>
        </div>
      </section>
    </div>
  );
}

/** A Jellyfin user and its target: the proposed one, or another. */
function UserRow({
  user: u,
  value,
  onChange,
}: {
  user: JellyfinUser;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const accounts = useQuery(AccountService.method.listAccounts, {}).data?.accounts ?? [];
  const mine = useQuery(ProfileService.method.listProfiles, {}).data?.profiles ?? [];
  const proposed = importTargetValue(u.target);
  const options = [
    { value: proposed, label: proposedLabel(u) },
    { value: "new-account", label: t("jellyfin.newAccount", { name: u.name }) },
    ...accounts.flatMap((a) =>
      a.account
        ? [
            {
              value: `new-profile:${a.account.id}`,
              label: t("jellyfin.newProfileIn", { name: a.account.username }),
            },
          ]
        : [],
    ),
    ...mine.map((p) => ({
      value: `profile:${p.id}`,
      label: t("jellyfin.existingProfile", { name: p.name }),
    })),
    { value: "skip", label: t("jellyfin.skip") },
  ].filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i);
  return (
    <div className={styles.importUser}>
      <span>
        <span className={styles.importName}>{u.name}</span>
        {u.administrator && <span className={styles.chip}> {t("jellyfin.administrator")}</span>}
        <span className={styles.muted}>
          {" "}
          ·{" "}
          {[
            `${t("jellyfin.items", { count: u.userData })} (${matchedShare(u.userDataMatched, u.userData)})`,
            t("jellyfin.userSessions", { count: u.sessions }),
            u.disabled ? t("jellyfin.disabled") : "",
            value === "new-account" && !u.hasPassword ? t("jellyfin.passwordToSet") : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {u.problem && <span className={styles.warn}> {serverText(u.problemText) || u.problem}</span>}
      </span>
      <Icon name="arrow" size={18} />
      <select
        className={styles.input}
        aria-label={t("jellyfin.destination", { name: u.name })}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The target proposed by the server, in plain words. */
function proposedLabel(u: JellyfinUser): string {
  switch (u.target?.kind) {
    case JellyfinTargetKind.NEW_ACCOUNT:
      return i18n.t("jellyfin.proposedNewAccount", { name: u.accountName || u.name });
    case JellyfinTargetKind.NEW_PROFILE:
      return i18n.t("jellyfin.proposedNewProfile", { profile: u.profileName, account: u.accountName });
    case JellyfinTargetKind.PROFILE:
      return i18n.t("jellyfin.proposedProfile", { profile: u.profileName, account: u.accountName });
    default:
      return i18n.t("jellyfin.skip");
  }
}

function Results({ result }: { result: ImportJellyfinResponse }) {
  const { t } = useTranslation();
  return (
    <section className={styles.card} aria-labelledby="result">
      <h2 id="result" className={styles.cardTitle}>
        {t("jellyfin.done")}
      </h2>
      <Status className={styles.ok} message={t("jellyfin.finished")} />
      <ul className={styles.rows}>
        {result.users.map((u) => (
          <li key={u.id} className={styles.taskRow}>
            <span className={styles.libText}>
              <span className={styles.libName}>
                {u.name} → {u.profileName}
              </span>
              <span className={styles.muted}>
                {[
                  u.accountCreated ? t("jellyfin.accountCreated") : "",
                  u.profileCreated ? t("jellyfin.profileCreated") : "",
                  t("jellyfin.updated", { count: u.userData }),
                  t("jellyfin.historyAdded", { count: u.history }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </li>
        ))}
        {result.users.length === 0 && <li className={styles.muted}>{t("jellyfin.nothing")}</li>}
      </ul>
    </section>
  );
}
