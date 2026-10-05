import { useQuery } from "@connectrpc/connect-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import type { Track } from "../../gen/laterna/v1/catalog_pb";
import { MusicService } from "../../gen/laterna/v1/music_pb";
import { Alert } from "../../ui/Alert";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import styles from "./music.module.css";
import { replayGainLine, trackFileRows } from "./trackDetails";

/** "Information" button of a track: its files (one version per format) and its ReplayGain. */
export function TrackInfoButton({ track, className }: { track: Track; className: string | undefined }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("music.infoLabel", { title: track.title })}
        title={t("music.info")}
      >
        <Icon name="info" size={16} />
      </button>
      {open && <TrackInfo track={track} onClose={() => setOpen(false)} />}
    </>
  );
}

function TrackInfo({ track, onClose }: { track: Track; onClose: () => void }) {
  const { t } = useTranslation();
  const info = useQuery(MusicService.method.getTrack, { trackId: track.id });
  const files = info.data?.files ?? [];
  const gain = replayGainLine((info.data?.track ?? track).replayGain);
  return (
    <Dialog title={track.title} onClose={onClose}>
      <p className={styles.infoContext}>
        {[track.artists || track.artistName, track.albumTitle].filter(Boolean).join(" · ")}
      </p>
      {info.isError && <Alert>{errorMessage(info.error)}</Alert>}
      {info.isPending && <p className={styles.infoContext}>{t("music.readingFiles")}</p>}
      {files.map((f) => (
        <section key={f.id} className={styles.infoFile} aria-label={f.version || t("music.file")}>
          {files.length > 1 && (
            <h3 className={styles.infoVersion}>{f.version || f.container.toUpperCase()}</h3>
          )}
          {!f.available && <p className={styles.infoMissing}>{t("music.missing")}</p>}
          <dl className={styles.infoList}>
            {trackFileRows(f).map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {info.isSuccess && (
        <dl className={styles.infoList}>
          <div>
            <dt>ReplayGain</dt>
            <dd>{gain || t("music.noGain")}</dd>
          </div>
        </dl>
      )}
    </Dialog>
  );
}
