import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { useInvalidate } from "../../../api/invalidate";
import { durationOf, seconds } from "../../../api/media";
import { durationLabel, graceLabel, missingGraces, scanIntervals } from "../../../features/admin/admin";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead } from "../../../features/admin/ui";
import { languageName } from "../../../features/catalog/format";
import { ServerService } from "../../../gen/laterna/v1/server_pb";
import { type Settings, SystemService, SystemTask } from "../../../gen/laterna/v1/system_pb";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Field } from "../../../ui/Field";
import { Status } from "../../../ui/Status";
import { Switch } from "../../../ui/Switch";

export const Route = createFileRoute("/_app/admin/settings")({
  component: SettingsPage,
});

/** Settings: applied at once, without restarting the server. */
function SettingsPage() {
  const { t } = useTranslation();
  const settings = useQuery(SystemService.method.getSettings, {});
  const status = useQuery(SystemService.method.getSystemStatus, {}).data?.status;
  return (
    <>
      <AdminHead title={t("settings.title")} sub={t("settings.subtitle")} />
      {settings.isError && <Alert>{errorMessage(settings.error)}</Alert>}
      <div className={styles.grid2}>
        {settings.data?.settings && <ServerSettings settings={settings.data.settings} />}
        <div className={styles.stack}>
          <ScheduledTasks />
          {status && (
            <section className={styles.card} aria-labelledby="folders">
              <h2 id="folders" className={styles.cardTitle}>
                {t("settings.folders")}
              </h2>
              <dl className={styles.dl}>
                <dt>{t("settings.data")}</dt>
                <dd className={styles.code}>{status.dataDir}</dd>
                <dt>{t("settings.cache")}</dt>
                <dd className={styles.code}>{status.cacheDir}</dd>
                <dt>{t("settings.metadata")}</dt>
                <dd className={styles.code}>{status.metadataDir}</dd>
                <dt>{t("settings.logs")}</dt>
                <dd className={styles.code}>{status.logDir}</dd>
              </dl>
              <p className={styles.muted}>{t("settings.foldersHint")}</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** Choice of a duration; a value set outside the choices is still offered as is. */
function DurationSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly { seconds: number; label: string }[];
  onChange: (seconds: number) => void;
}) {
  return (
    <label className={styles.selectField}>
      <span className={styles.label}>{label}</span>
      <select className={styles.input} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((o) => (
          <option key={o.seconds} value={o.seconds}>
            {o.label}
          </option>
        ))}
        {!options.some((o) => o.seconds === value) && <option value={value}>{durationLabel(value)}</option>}
      </select>
    </label>
  );
}

function ServerSettings({ settings: s }: { settings: Settings }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [name, setName] = useState(s.serverName);
  const [scan, setScan] = useState(Math.round(seconds(s.scanInterval)));
  const [grace, setGrace] = useState(Math.round(seconds(s.missingGrace)));
  const [images, setImages] = useState(s.downloadImages);
  const [trickplay, setTrickplay] = useState(s.trickplay);
  const [watch, setWatch] = useState(s.watchLibraries);
  const [segments, setSegments] = useState(s.detectSegments);
  const [language, setLanguage] = useState(s.language);
  const [transcodes, setTranscodes] = useState(s.maxTranscodes);
  // Languages the server can write its texts in.
  const languages = useQuery(ServerService.method.getServerInfo, {}).data?.languages ?? [s.language];
  const [saved, setSaved] = useState(false);
  const update = useMutation(SystemService.method.updateSettings, {
    onSuccess: async () => {
      // The server's name is also announced by GetServerInfo.
      await invalidate(SystemService, ServerService);
      setSaved(true);
    },
  });
  const changed =
    name.trim() !== s.serverName ||
    scan !== Math.round(seconds(s.scanInterval)) ||
    grace !== Math.round(seconds(s.missingGrace)) ||
    images !== s.downloadImages ||
    trickplay !== s.trickplay ||
    watch !== s.watchLibraries ||
    segments !== s.detectSegments ||
    language !== s.language ||
    transcodes !== s.maxTranscodes;
  const touch = () => setSaved(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({
      serverName: name.trim() !== s.serverName ? name.trim() : undefined,
      scanInterval: scan !== Math.round(seconds(s.scanInterval)) ? durationOf(scan) : undefined,
      missingGrace: grace !== Math.round(seconds(s.missingGrace)) ? durationOf(grace) : undefined,
      downloadImages: images !== s.downloadImages ? images : undefined,
      trickplay: trickplay !== s.trickplay ? trickplay : undefined,
      watchLibraries: watch !== s.watchLibraries ? watch : undefined,
      detectSegments: segments !== s.detectSegments ? segments : undefined,
      language: language !== s.language ? language : undefined,
      maxTranscodes: transcodes !== s.maxTranscodes ? transcodes : undefined,
    });
  };

  return (
    <section className={styles.card} aria-labelledby="server-settings">
      <h2 id="server-settings" className={styles.cardTitle}>
        {t("settings.server")}
      </h2>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={t("settings.name")}
          required
          maxLength={100}
          value={name}
          onChange={(e) => {
            touch();
            setName(e.target.value);
          }}
        />
        <div className={styles.grid2Fields}>
          <DurationSelect
            label={t("settings.scan")}
            value={scan}
            options={scanIntervals.map((o) => ({ seconds: o.seconds, label: t(o.label) }))}
            onChange={(v) => {
              touch();
              setScan(v);
            }}
          />
          <DurationSelect
            label={t("settings.grace")}
            value={grace}
            options={missingGraces.map((g) => ({ seconds: g, label: graceLabel(g) }))}
            onChange={(v) => {
              touch();
              setGrace(v);
            }}
          />
        </div>
        <p className={styles.muted}>{t("settings.graceHint")}</p>
        <Switch
          label={t("settings.watch")}
          hint={t("settings.watchHint")}
          on={watch}
          onChange={(on) => {
            touch();
            setWatch(on);
          }}
        />
        <Switch
          label={t("settings.images")}
          hint={t("settings.imagesHint")}
          on={images}
          onChange={(on) => {
            touch();
            setImages(on);
          }}
        />
        <Switch
          label={t("settings.trickplay")}
          hint={t("settings.trickplayHint")}
          on={trickplay}
          onChange={(on) => {
            touch();
            setTrickplay(on);
          }}
        />
        <Switch
          label={t("settings.segments")}
          hint={t("settings.segmentsHint")}
          on={segments}
          onChange={(on) => {
            touch();
            setSegments(on);
          }}
        />
        <div className={styles.grid2Fields}>
          <Field
            label={t("settings.transcodes")}
            hint={t("settings.transcodesHint")}
            type="number"
            min={0}
            max={64}
            value={transcodes}
            onChange={(e) => {
              touch();
              setTranscodes(Math.max(0, Math.min(64, Math.round(Number(e.target.value) || 0))));
            }}
          />
          <label className={styles.selectField}>
            <span className={styles.label}>{t("settings.language")}</span>
            <select
              className={styles.input}
              value={language}
              onChange={(e) => {
                touch();
                setLanguage(e.target.value);
              }}
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {languageName(l)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.muted}>{t("settings.languageHint")}</p>
        {update.isError && <Alert>{errorMessage(update.error)}</Alert>}
        <Status className={styles.ok} message={saved ? t("settings.applied") : ""} />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={!changed || !name.trim() || update.isPending}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}

const tasks = [
  {
    task: SystemTask.SCAN_LIBRARIES,
    label: "settings.scanAll",
    hint: "settings.scanAllHint",
    done: "settings.scanAllDone",
  },
  {
    task: SystemTask.PURGE,
    label: "settings.purge",
    hint: "settings.purgeHint",
    done: "settings.purgeDone",
  },
] as const;

function ScheduledTasks() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [done, setDone] = useState("");
  const run = useMutation(SystemService.method.runTask, {
    onSuccess: (_, req) => {
      const task = tasks.find((x) => x.task === req.task);
      setDone(task ? t(task.done) : "");
      return invalidate(SystemService);
    },
  });
  return (
    <section className={styles.card} aria-labelledby="scheduled">
      <h2 id="scheduled" className={styles.cardTitle}>
        {t("settings.scheduled")}
      </h2>
      {run.isError && <Alert>{errorMessage(run.error)}</Alert>}
      <Status className={styles.ok} message={done} />
      <ul className={styles.rows}>
        {tasks.map((task) => (
          <li key={task.task} className={styles.taskRow}>
            <span className={styles.libText}>
              <span className={styles.libName}>{t(task.label)}</span>
              <span className={styles.muted}>{t(task.hint)}</span>
            </span>
            <button
              type="button"
              className={styles.small}
              disabled={run.isPending}
              onClick={() => {
                setDone("");
                run.mutate({ task: task.task });
              }}
            >
              {t("settings.runNow")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
