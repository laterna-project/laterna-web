import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { DownloadRow } from "../../features/downloads/DownloadRow";
import { downloadItem, qualities } from "../../features/downloads/downloads";
import styles from "../../features/downloads/downloads.module.css";
import { type Download, DownloadService } from "../../gen/laterna/v1/download_pb";
import { detectDeviceProfile } from "../../player/deviceProfile";
import { Alert } from "../../ui/Alert";

export const Route = createFileRoute("/_app/offline")({
  component: Downloads,
});

const savedKey = "laterna.downloads.saved";

/** Downloads already saved from this device (identifiers), kept on the device. */
function readSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(savedKey) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Downloads: the ones of this device, to save. */
function Downloads() {
  const { t } = useTranslation();
  const { session } = Route.useRouteContext();
  const invalidate = useInvalidate();
  // Refetched on each DownloadsChanged of the event stream, preparation progress included.
  const list = useQuery(DownloadService.method.listDownloads, {});
  const downloads = [...(list.data?.downloads ?? [])].reverse();
  const [saved, setSaved] = useState(readSaved);
  const keepSaved = (ids: string[]) => {
    setSaved(ids);
    try {
      localStorage.setItem(savedKey, JSON.stringify(ids));
    } catch {
      // Storage unavailable: the "Saved" mark does not survive a reload.
    }
  };

  const refresh = () => invalidate(DownloadService);
  const remove = useMutation(DownloadService.method.deleteDownloads, {
    onSuccess: (_, req) => {
      keepSaved(saved.filter((id) => !req.downloadIds?.includes(id)));
      return refresh();
    },
  });
  const create = useMutation(DownloadService.method.createDownloads);
  // A failed download is requested again with the same version, quality and audio track; the old
  // one is removed.
  const retry = async (d: Download) => {
    await create.mutateAsync({
      itemIds: [downloadItem(d).id],
      fileId: d.fileId,
      quality: d.quality,
      audioStreamIndex: d.audioStreamIndex,
      device: detectDeviceProfile(),
    });
    await remove.mutateAsync({ downloadIds: [d.id] });
  };
  const error = remove.error ?? create.error;
  const busy = remove.isPending || create.isPending;

  return (
    <div className={styles.page}>
      <div className={styles.head} data-ui="page-header">
        <h1 className={styles.pageTitle}>{t("nav.downloads")}</h1>
        <p className={styles.pageSub}>
          {t("downloads.pageSub", { device: session.device?.name || t("downloads.thisDevice") })}
        </p>
      </div>
      <div className={styles.layout}>
        <section className={styles.panel} aria-label={t("downloads.files")}>
          {error && <Alert>{errorMessage(error)}</Alert>}
          {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
          {list.isSuccess && downloads.length === 0 ? (
            <p className={styles.empty}>{t("downloads.empty")}</p>
          ) : (
            <ul className={styles.rows}>
              {downloads.map((d) => (
                <DownloadRow
                  key={d.id}
                  download={d}
                  saved={saved.includes(d.id)}
                  busy={busy}
                  onSaved={() =>
                    // Marks of downloads the server forgot are dropped along the way.
                    keepSaved([
                      ...saved.filter((id) => id !== d.id && downloads.some((x) => x.id === id)),
                      d.id,
                    ])
                  }
                  onRetry={() => void retry(d).catch(() => undefined)}
                  onRemove={() => remove.mutate({ downloadIds: [d.id] })}
                />
              ))}
            </ul>
          )}
        </section>
        <aside className={styles.aside}>
          <section className={styles.asideCard}>
            <h2 className={styles.asideTitle}>{t("downloads.qualities")}</h2>
            <dl className={styles.qualityList}>
              {qualities.map((q) => (
                <div key={q.value}>
                  <dt>{t(q.label)}</dt>
                  <dd>{t(q.video)}</dd>
                  <dd>
                    <span className={styles.musicTag}>{t("downloads.music")}</span> {t(q.music)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className={styles.note}>{t("downloads.note")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
