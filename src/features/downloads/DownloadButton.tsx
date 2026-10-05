import { useMutation, useQuery } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { AuthService } from "../../gen/laterna/v1/auth_pb";
import { type MediaFile, StreamKind } from "../../gen/laterna/v1/catalog_pb";
import { DownloadService } from "../../gen/laterna/v1/download_pb";
import { detectDeviceProfile } from "../../player/deviceProfile";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { streamLabel } from "../catalog/format";
import { qualities, versionLabel } from "./downloads";
import styles from "./downloads.module.css";

/**
 * "Download" button of detail pages: choose a quality, then the server prepares the files (a series
 * or a season gives its episodes, an album its tracks); they are saved from Downloads. For a single
 * movie or episode, files also lets the person choose the version and the audio track. Absent if
 * the account is not allowed to download.
 */
export function DownloadButton({
  itemIds,
  what,
  music = false,
  files = [],
  className,
  children,
}: {
  itemIds: readonly string[];
  /** What is downloaded, for the title ("the movie", "the album"). */
  what: string;
  music?: boolean;
  /** Files of a single movie or episode: versions and audio tracks to choose from. */
  files?: readonly MediaFile[];
  className: string | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const account = useQuery(AuthService.method.getSession, {}).data?.session?.account;
  if (!account || account.denyDownloads) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={t("downloads.buttonTitle")}
      >
        {children}
      </button>
      {open && (
        <ChooseQuality
          itemIds={itemIds}
          what={what}
          music={music}
          files={files}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ChooseQuality({
  itemIds,
  what,
  music,
  files,
  onClose,
}: {
  itemIds: readonly string[];
  what: string;
  music: boolean;
  files: readonly MediaFile[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  // Version and audio track: offered only when there is a choice; otherwise the server's.
  const versions = files.filter((f) => f.available);
  const [fileId, setFileId] = useState(versions[0]?.id ?? "");
  const tracks =
    versions.find((f) => f.id === fileId)?.streams.filter((s) => s.kind === StreamKind.AUDIO) ?? [];
  const [audio, setAudio] = useState<number | undefined>(undefined);
  const create = useMutation(DownloadService.method.createDownloads, {
    onSuccess: () => invalidate(DownloadService),
  });
  const count = create.data?.downloads.length ?? 0;
  // The chosen button disappears with the list: focus goes to the report, read aloud.
  const result = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (create.isSuccess) result.current?.focus();
  }, [create.isSuccess]);

  return (
    <Dialog title={t("downloads.title", { what })} onClose={onClose}>
      {create.isSuccess ? (
        <>
          <p ref={result} tabIndex={-1} className={styles.done}>
            {t("downloads.requested", { count: Math.max(1, count) })}
          </p>
          <div className={styles.dialogActions}>
            <Button onClick={onClose}>{t("common.close")}</Button>
            <Link to="/offline" className={styles.go} onClick={onClose}>
              {t("downloads.seeDownloads")}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={styles.intro}>{t("downloads.intro")}</p>
          {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
          {(versions.length > 1 || tracks.length > 1) && (
            <div className={styles.options}>
              {versions.length > 1 && (
                <label className={styles.option}>
                  <span className={styles.optionLabel}>{t("downloads.version")}</span>
                  <select
                    className={styles.select}
                    value={fileId}
                    onChange={(e) => {
                      setFileId(e.target.value);
                      setAudio(undefined);
                    }}
                  >
                    {versions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {versionLabel(f)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {tracks.length > 1 && (
                <label className={styles.option}>
                  <span className={styles.optionLabel}>{t("downloads.audioTrack")}</span>
                  <select
                    className={styles.select}
                    value={audio ?? ""}
                    onChange={(e) => setAudio(e.target.value === "" ? undefined : Number(e.target.value))}
                  >
                    <option value="">{t("downloads.default")}</option>
                    {tracks.map((tr) => (
                      <option key={tr.index} value={tr.index}>
                        {streamLabel(tr)}
                        {tr.default && tracks.filter((x) => x.default).length === 1
                          ? t("downloads.defaultSuffix")
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <ul className={styles.qualities}>
            {qualities.map((q, i) => (
              <li key={q.value}>
                <button
                  type="button"
                  className={styles.quality}
                  disabled={create.isPending}
                  data-autofocus={i === 0 || undefined}
                  onClick={() =>
                    create.mutate({
                      itemIds: [...itemIds],
                      quality: q.value,
                      device: detectDeviceProfile(),
                      fileId: versions.length > 1 ? fileId : "",
                      audioStreamIndex: audio,
                    })
                  }
                >
                  <span className={styles.qualityName}>{t(q.label)}</span>
                  <span className={styles.qualityHint}>{t(music ? q.music : q.video)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
