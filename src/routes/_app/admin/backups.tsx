import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import { saveFile } from "../../../api/save";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead } from "../../../features/admin/ui";
import { fileSize } from "../../../features/catalog/format";
import { ActivityService } from "../../../gen/laterna/v1/activity_pb";
import { type Backup, BackupKind, SystemService } from "../../../gen/laterna/v1/system_pb";
import { locale } from "../../../i18n";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Field } from "../../../ui/Field";
import { Icon } from "../../../ui/Icon";
import { Status } from "../../../ui/Status";

export const Route = createFileRoute("/_app/admin/backups")({
  component: Backups,
});

const kinds = {
  [BackupKind.UNSPECIFIED]: "adminBackups.kind.manual",
  [BackupKind.AUTO]: "adminBackups.kind.auto",
  [BackupKind.MANUAL]: "adminBackups.kind.manual",
  [BackupKind.MIGRATION]: "adminBackups.kind.migration",
  [BackupKind.REPLACED]: "adminBackups.kind.replaced",
} as const;

const when = (b: Backup) =>
  b.createdAt
    ? new Intl.DateTimeFormat(locale(), { dateStyle: "long", timeStyle: "short" }).format(
        timestampDate(b.createdAt),
      )
    : b.name;

/**
 * Database backups (server: docs/design/storage.md): nightly, manual, before a schema update,
 * before a restore. A backup is downloaded with the token; a restore is prepared here and applied
 * at the server's next start.
 */
function Backups() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const list = useQuery(SystemService.method.listBackups, {});
  const backups = list.data?.backups ?? [];
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const [removing, setRemoving] = useState<Backup | null>(null);
  const [done, setDone] = useState("");
  const [saving, setSaving] = useState("");
  const [saveError, setSaveError] = useState("");
  const refresh = (message: string) => async () => {
    await invalidate(SystemService, ActivityService);
    setDone(message);
  };
  const create = useMutation(SystemService.method.createBackup, {
    onSuccess: (res) => refresh(t("adminBackups.created", { name: res.backup?.name ?? "" }))(),
  });
  const remove = useMutation(SystemService.method.deleteBackup, {
    onSuccess: async (_, req) => {
      setRemoving(null);
      await refresh(t("adminBackups.deleted", { name: req.name ?? "" }))();
    },
  });
  const restore = useMutation(SystemService.method.restoreBackup, {
    onSuccess: async () => {
      setRestoring(null);
      await refresh(t("adminBackups.restoreStaged"))();
    },
  });
  const cancel = useMutation(SystemService.method.cancelRestore, {
    onSuccess: (res) => refresh(res.cancelled ? t("adminBackups.restoreCancelled") : "")(),
  });
  const error = create.error ?? cancel.error;

  const download = async (name: string) => {
    setSaveError("");
    setSaving(name);
    try {
      await saveFile(`/backups/${encodeURIComponent(name)}`, name);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving("");
    }
  };

  return (
    <>
      <AdminHead title={t("adminBackups.title")} sub={t("adminBackups.subtitle")}>
        <button
          type="button"
          className={styles.dark}
          disabled={create.isPending}
          onClick={() => {
            setDone("");
            create.mutate({});
          }}
        >
          {create.isPending ? t("adminBackups.creating") : t("adminBackups.create")}
        </button>
      </AdminHead>
      {list.data?.restorePending && (
        <p className={styles.banner} role="status">
          <span className={styles.bannerMark} aria-hidden="true">
            !
          </span>
          <span>
            <strong>{t("adminBackups.pending")}</strong> {t("adminBackups.pendingText")}
          </span>
          <button
            type="button"
            className={styles.small}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({})}
          >
            {t("adminBackups.cancelRestore")}
          </button>
        </p>
      )}
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {saveError && <Alert>{saveError}</Alert>}
      <Status className={styles.ok} message={done} />
      <div className={styles.grid2}>
        <section className={styles.card} aria-labelledby="backup-list">
          <h2 id="backup-list" className={styles.cardTitle}>
            {t("adminBackups.list")}
          </h2>
          {list.isSuccess && backups.length === 0 && <p className={styles.muted}>{t("adminBackups.none")}</p>}
          <ul className={styles.rows}>
            {backups.map((b) => (
              <li key={b.name} className={styles.taskRow}>
                <span className={styles.libText}>
                  <span className={styles.libName}>{when(b)}</span>
                  <span className={styles.muted}>
                    {[t(kinds[b.kind]), fileSize(b.sizeBytes)].join(" · ")}
                  </span>
                  <span className={styles.muted}>{b.name}</span>
                </span>
                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={saving !== ""}
                    onClick={() => void download(b.name)}
                    aria-label={t("adminBackups.downloadLabel", { name: b.name })}
                    title={t("adminBackups.download")}
                  >
                    <Icon name="download" size={16} />
                  </button>
                  <button type="button" className={styles.small} onClick={() => setRestoring(b)}>
                    {t("adminBackups.restore")}
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setRemoving(b)}
                    aria-label={t("adminBackups.deleteLabel", { name: b.name })}
                    title={t("common.delete")}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <div className={styles.stack}>
          <NightlyBackups />
          <section className={styles.card} aria-labelledby="restore">
            <h2 id="restore" className={styles.cardTitle}>
              {t("adminBackups.howTitle")}
            </h2>
            <p className={styles.muted}>{t("adminBackups.howRestore")}</p>
            <p className={styles.muted}>{t("adminBackups.howCli")}</p>
          </section>
        </div>
      </div>

      {restoring && (
        <Dialog
          title={t("adminBackups.restoreTitle", { when: when(restoring) })}
          onClose={() => setRestoring(null)}
        >
          <p>{t("adminBackups.restoreText")}</p>
          {restore.isError && <Alert>{errorMessage(restore.error)}</Alert>}
          <div className={styles.actions}>
            <span className={styles.spacer} />
            <Button onClick={() => setRestoring(null)} data-autofocus>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={restore.isPending}
              onClick={() => restore.mutate({ name: restoring.name })}
            >
              {t("adminBackups.restoreConfirm")}
            </Button>
          </div>
        </Dialog>
      )}
      {removing && (
        <Dialog
          title={t("adminBackups.deleteTitle", { when: when(removing) })}
          onClose={() => setRemoving(null)}
        >
          <p>{t("adminBackups.deleteText")}</p>
          {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
          <div className={styles.actions}>
            <span className={styles.spacer} />
            <Button onClick={() => setRemoving(null)} data-autofocus>
              {t("common.keep")}
            </Button>
            <Button
              variant="primary"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ name: removing.name })}
            >
              {t("common.delete")}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Nightly backups: how many to keep (backup_keep setting; 0 = none). */
function NightlyBackups() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const settings = useQuery(SystemService.method.getSettings, {}).data?.settings;
  const [keep, setKeep] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const value = keep ?? settings?.backupKeep ?? 7;
  const update = useMutation(SystemService.method.updateSettings, {
    onSuccess: async () => {
      await invalidate(SystemService, ActivityService);
      setKeep(null);
      setSaved(true);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ backupKeep: value });
  };
  return (
    <section className={styles.card} aria-labelledby="nightly">
      <h2 id="nightly" className={styles.cardTitle}>
        {t("adminBackups.nightly")}
      </h2>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={t("adminBackups.keep")}
          hint={t("adminBackups.keepHint")}
          type="number"
          min={0}
          max={90}
          value={value}
          onChange={(e) => {
            setSaved(false);
            setKeep(Math.max(0, Math.min(90, Math.round(Number(e.target.value) || 0))));
          }}
        />
        {update.isError && <Alert>{errorMessage(update.error)}</Alert>}
        <Status className={styles.ok} message={saved ? t("settings.applied") : ""} />
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={!settings || value === settings.backupKeep || update.isPending}
          >
            {t("common.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
