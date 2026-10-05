import { useQuery } from "@connectrpc/connect-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import {
  type FolderLibrary,
  FolderRelation,
  LibraryService,
  type MediaCounts,
} from "../../gen/laterna/v1/library_pb";
import i18n from "../../i18n";
import { Alert } from "../../ui/Alert";
import { Dialog } from "../../ui/Dialog";
import styles from "./folderPicker.module.css";

/** "12 videos · 3 books": media found among the first entries of a folder. */
export function mediaHint(m: MediaCounts | undefined): string {
  if (!m) return "";
  return [
    m.videos > 0 && i18n.t("folderPicker.videos", { count: m.videos }),
    m.audio > 0 && i18n.t("folderPicker.audio", { count: m.audio }),
    m.books > 0 && i18n.t("folderPicker.books", { count: m.books }),
    m.photos > 0 && i18n.t("folderPicker.photos", { count: m.photos }),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** How the folder relates to another library; empty if it is free (or belongs to this one). */
export function libraryClash(lib: FolderLibrary | undefined, own?: string): string {
  if (!lib?.libraryId || lib.libraryId === own) return "";
  switch (lib.relation) {
    case FolderRelation.ROOT:
      return i18n.t("folderPicker.rootOf", { name: lib.libraryName });
    case FolderRelation.INSIDE:
      return i18n.t("folderPicker.inside", { name: lib.libraryName });
    case FolderRelation.CONTAINS:
      return i18n.t("folderPicker.contains", { name: lib.libraryName });
    default:
      return "";
  }
}

/**
 * Browses the folders as the server sees them (the browser cannot see its disks) and returns the
 * chosen one. A folder of another library is flagged: the server would refuse it.
 */
export function FolderPicker({
  initial,
  libraryId,
  onPick,
  onClose,
}: {
  initial?: string;
  /** Library being edited: its own folders are not flagged. */
  libraryId?: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState(initial ?? "");
  const query = useQuery(LibraryService.method.browseFolders, { path }, { retry: false });
  const res = query.data;
  const here = res?.path ?? "";
  const clash = libraryClash(res?.library, libraryId);
  const media = mediaHint(res?.media);

  return (
    <Dialog title={t("folderPicker.title")} onClose={onClose} wide>
      <div className={styles.picker}>
        <div className={styles.where}>
          <button
            type="button"
            className={styles.up}
            disabled={!here}
            onClick={() => setPath(res?.parent ?? "")}
            aria-label={
              res?.parent ? t("folderPicker.upTo", { path: res.parent }) : t("folderPicker.backToStart")
            }
          >
            {t("folderPicker.up")}
          </button>
          {/* The path reads right to left: its end, the most useful part, stays visible. */}
          <span className={styles.path} title={here}>
            <bdi>{here || t("folderPicker.startingPoints")}</bdi>
          </span>
          <button
            type="button"
            className={styles.choose}
            disabled={!here || Boolean(clash)}
            onClick={() => onPick(here)}
            data-autofocus
          >
            {t("folderPicker.choose")}
          </button>
        </div>
        {(media || clash) && (
          <p className={styles.note}>
            {[media && t("folderPicker.here", { media }), clash && t("folderPicker.taken", { what: clash })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {query.isError && (
          <Alert>
            {errorMessage(query.error)}{" "}
            <button type="button" className={styles.up} onClick={() => setPath("")}>
              {t("folderPicker.startingPoints")}
            </button>
          </Alert>
        )}
        <ul
          className={styles.list}
          aria-label={
            here ? t("folderPicker.subfoldersOf", { path: here }) : t("folderPicker.startingPoints")
          }
        >
          {(res?.folders ?? []).map((f) => {
            const taken = libraryClash(f.library, libraryId);
            const hint = mediaHint(f.media);
            return (
              <li key={f.path}>
                <button
                  type="button"
                  className={styles.folder}
                  disabled={!f.readable}
                  onClick={() => setPath(f.path)}
                >
                  <span aria-hidden="true">{f.hasSubfolders ? "▸" : "·"}</span>
                  <span className={styles.name}>{f.name}</span>
                  {!f.readable && <span className={styles.hint}>{t("folderPicker.unreadable")}</span>}
                  {hint && <span className={styles.hint}>{hint}</span>}
                  {taken && <span className={styles.badge}>{taken}</span>}
                </button>
              </li>
            );
          })}
          {res && res.folders.length === 0 && (
            <li className={styles.note}>{t("folderPicker.noSubfolder")}</li>
          )}
        </ul>
        {res?.truncated && <p className={styles.note}>{t("folderPicker.truncated")}</p>}
      </div>
    </Dialog>
  );
}

/** "Browse" button placed next to a folder field. */
export function BrowseButton({
  value,
  libraryId,
  label,
  onPick,
}: {
  value: string;
  libraryId?: string;
  /** Accessible name ("Browse for folder 1"). */
  label: string;
  onPick: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.browse} aria-label={label} onClick={() => setOpen(true)}>
        {t("folderPicker.browse")}
      </button>
      {open && (
        <FolderPicker
          initial={value.trim() || undefined}
          libraryId={libraryId}
          onClose={() => setOpen(false)}
          onPick={(p) => {
            onPick(p);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
