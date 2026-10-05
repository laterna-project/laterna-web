import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageKind, mediaUrl, pickImage } from "../../api/media";
import { saveFile } from "../../api/save";
import { serverText } from "../../api/text";
import { type Download, DownloadState } from "../../gen/laterna/v1/download_pb";
import { locale } from "../../i18n";
import { Artwork } from "../../ui/Artwork";
import {
  downloadItem,
  downloadLine,
  fontFileName,
  stateLabel,
  subtitleFileName,
  subtitleLabel,
} from "./downloads";
import styles from "./downloads.module.css";

/** A row of Downloads: what is prepared, its state, and what to do with it. */
export function DownloadRow({
  download: d,
  saved,
  busy,
  onSaved,
  onRetry,
  onRemove,
}: {
  download: Download;
  /** Already saved from this device. */
  saved: boolean;
  busy: boolean;
  onSaved: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const item = downloadItem(d);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const ready = d.state === DownloadState.READY;
  const failed = d.state === DownloadState.FAILED;
  const expires = d.expiresAt ? new Date(Number(d.expiresAt.seconds) * 1000) : undefined;

  const save = async (path: string, fileName: string, main: boolean) => {
    setError("");
    setSaving(0);
    try {
      const done = await saveFile(path, fileName, (n, total) => setSaving(total ? n / total : 0));
      if (done && main) onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const state = saving !== null ? t("downloads.saving", { n: Math.floor(saving * 100) }) : stateLabel(d);
  const tone = failed ? "failed" : ready ? (saved ? "saved" : "ready") : "pending";
  const progress = saving ?? (d.state === DownloadState.PREPARING ? d.progress : null);

  return (
    <li className={styles.row} data-ui="download">
      <Artwork
        image={pickImage(item.images, ImageKind.POSTER, ImageKind.THUMB, ImageKind.BACKDROP)}
        sizes="72px"
        ratio={item.ratio}
        universe={item.universe}
        className={styles.art}
      />
      <div className={styles.text}>
        <span className={styles.context}>{item.context}</span>
        <span className={styles.title}>{item.title}</span>
        <span className={styles.line}>{downloadLine(d)}</span>
        {ready && expires && (
          <span className={styles.expires}>
            {t("downloads.expires", {
              date: expires.toLocaleDateString(locale(), { day: "numeric", month: "long" }),
            })}
          </span>
        )}
        {d.reasons.length > 0 && (
          <span className={styles.reasons}>
            {(d.reasonTexts.length ? d.reasonTexts.map(serverText) : d.reasons).join(" ; ")}
          </span>
        )}
        {failed && d.error && <span className={styles.error}>{d.error}</span>}
        {error && <span className={styles.error}>{error}</span>}
        {progress !== null && (
          <span className={styles.bar} aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        )}
        {ready && d.subtitles.length > 0 && (
          <span className={styles.subtitles}>
            {t("downloads.subtitles")}
            {d.subtitles.flatMap((s) =>
              s.files.map((f) => (
                <button
                  key={`${s.index}.${f.format}`}
                  type="button"
                  className={styles.subtitle}
                  disabled={saving !== null}
                  onClick={() =>
                    void save(f.url, subtitleFileName(d.fileName, s.language, s.index, f.format), false)
                  }
                >
                  {subtitleLabel(s, f.format)}
                </button>
              )),
            )}
          </span>
        )}
        {ready && d.fonts.length > 0 && (
          <span className={styles.subtitles}>
            {t("downloads.fonts")}
            {d.fonts.map((f) => (
              <a key={f.url} className={styles.subtitle} href={mediaUrl(f.url)} download={fontFileName(f)}>
                {fontFileName(f)}
              </a>
            ))}
          </span>
        )}
      </div>
      <div className={styles.side}>
        <span className={styles.state} data-tone={tone}>
          {saved && ready && saving === null ? t("downloads.saved") : state}
        </span>
        <div className={styles.rowActions}>
          {ready && (
            <button
              type="button"
              className={saved ? styles.secondary : styles.primary}
              disabled={saving !== null}
              onClick={() => void save(d.url, d.fileName, true)}
            >
              {t("downloads.save")}
            </button>
          )}
          {failed && (
            <button type="button" className={styles.primary} disabled={busy} onClick={onRetry}>
              {t("downloads.retry")}
            </button>
          )}
          <button
            type="button"
            className={styles.secondary}
            disabled={busy || saving !== null}
            onClick={onRemove}
            aria-label={t("downloads.removeLabel", { title: item.title })}
          >
            {t("downloads.remove")}
          </button>
        </div>
      </div>
    </li>
  );
}
