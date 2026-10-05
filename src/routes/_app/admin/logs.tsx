import { useQuery } from "@connectrpc/connect-query";
import { keepPreviousData } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { saveFile } from "../../../api/save";
import { levelName, logLevels } from "../../../features/admin/admin";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead } from "../../../features/admin/ui";
import { fileSize } from "../../../features/catalog/format";
import { LogLevel, SystemService } from "../../../gen/laterna/v1/system_pb";
import { locale } from "../../../i18n";
import { Alert } from "../../../ui/Alert";
import { Icon } from "../../../ui/Icon";
import { Switch } from "../../../ui/Switch";

export const Route = createFileRoute("/_app/admin/logs")({
  component: Logs,
});

/** Logs: the latest messages kept in memory, daily files. */
function Logs() {
  const { t } = useTranslation();
  // Info by default: requests (debug), including this page's, drown out the rest.
  const [level, setLevel] = useState(LogLevel.INFO);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState(false);
  const [limit, setLimit] = useState(200);
  // The search runs once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const logs = useQuery(
    SystemService.method.listLogs,
    { minLevel: level, query, limit },
    { refetchInterval: live ? 3000 : false, placeholderData: keepPreviousData },
  );
  const files = useQuery(SystemService.method.listLogFiles, {});
  const [saving, setSaving] = useState("");
  const [saveError, setSaveError] = useState("");
  const entries = logs.data?.entries ?? [];

  const save = async (name: string) => {
    setSaveError("");
    setSaving(name);
    try {
      await saveFile(`/logs/${encodeURIComponent(name)}`, name);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving("");
    }
  };

  return (
    <>
      <AdminHead title={t("adminLogs.title")} sub={t("adminLogs.subtitle")} />
      <div className={styles.filters}>
        <fieldset className={styles.levels}>
          <legend className="sr-only">{t("adminLogs.level")}</legend>
          {logLevels.map((l) => (
            <button
              key={l.value}
              type="button"
              className={styles.choice}
              data-level={l.value}
              aria-pressed={level === l.value}
              onClick={() => setLevel(l.value)}
            >
              <span className={styles.levelDot} data-level={l.value} />
              {t(l.label)}
            </button>
          ))}
        </fieldset>
        <label className={styles.searchField}>
          <span className="sr-only">{t("adminLogs.search")}</span>
          <input
            type="search"
            className={styles.input}
            placeholder={t("adminLogs.searchPlaceholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <Switch label={t("adminLogs.live")} hint={t("adminLogs.liveHint")} on={live} onChange={setLive} />
      </div>
      <div className={styles.split}>
        <section className={styles.card} aria-label={t("adminLogs.messages")}>
          {logs.isError && <Alert>{errorMessage(logs.error)}</Alert>}
          {logs.isSuccess && entries.length === 0 && <p className={styles.muted}>{t("adminLogs.none")}</p>}
          <ol className={styles.logs}>
            {entries.map((e, i) => {
              const at = e.time
                ? new Date(Number(e.time.seconds) * 1000 + Math.floor(e.time.nanos / 1e6))
                : undefined;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: messages have no identifier; the list is read again as a whole.
                <li key={i} className={styles.log} data-level={e.level}>
                  <time
                    className={styles.logAt}
                    dateTime={at?.toISOString()}
                    title={at?.toLocaleString(locale())}
                  >
                    {at?.toLocaleTimeString(locale())}
                  </time>
                  <span className={styles.logLevel} data-level={e.level}>
                    {levelName(e.level)}
                  </span>
                  <span className={styles.logBody}>
                    <span className={styles.logMessage}>{e.message}</span>
                    {e.attrs.length > 0 && (
                      <span className={styles.attrs}>
                        {e.attrs.map((a) => (
                          <span key={a.key} className={styles.attr}>
                            <span className={styles.attrKey}>{a.key}</span> {a.value}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          {entries.length >= limit && limit < 1000 && (
            <div className={styles.actions}>
              <button type="button" className={styles.small} onClick={() => setLimit(1000)}>
                {t("adminLogs.showMore")}
              </button>
            </div>
          )}
        </section>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="files">
            <h2 id="files" className={styles.cardTitle}>
              {t("adminLogs.files")}
            </h2>
            {saveError && <Alert>{saveError}</Alert>}
            {files.isError && <Alert>{errorMessage(files.error)}</Alert>}
            <ul className={styles.rows}>
              {(files.data?.files ?? []).map((f) => (
                <li key={f.name} className={styles.fileRow}>
                  <span className={styles.libName}>{f.name}</span>
                  <span className={styles.muted}>{fileSize(f.size)}</span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={saving !== ""}
                    onClick={() => void save(f.name)}
                    aria-label={t("adminLogs.saveLabel", { name: f.name })}
                    title={t("adminLogs.save")}
                  >
                    <Icon name="download" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
