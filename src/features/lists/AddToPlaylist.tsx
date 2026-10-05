import { useMutation, useQuery } from "@connectrpc/connect-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { PlaylistService } from "../../gen/laterna/v1/playlist_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { playlistMeta } from "./entries";
import styles from "./lists.module.css";

/** Refetches the playlists after a change. */
export function useRefreshPlaylists() {
  const invalidate = useInvalidate();
  return () => invalidate(PlaylistService);
}

/**
 * "Add to a playlist" button: choose one of the profile's playlists, or create one. A season, a
 * series, an album or an artist adds its episodes or tracks, in order (server).
 */
export function AddToPlaylist({
  itemIds,
  what,
  className,
  children,
}: {
  itemIds: readonly string[];
  /** What is added, for the title ("the album", "the movie"). */
  what: string;
  className: string | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={t("lists.addTitle")}
      >
        {children}
      </button>
      {open && <ChooseList itemIds={itemIds} what={what} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChooseList({
  itemIds,
  what,
  onClose,
}: {
  itemIds: readonly string[];
  what: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const lists = useQuery(PlaylistService.method.listPlaylists, {});
  const refresh = useRefreshPlaylists();
  const [done, setDone] = useState<string | null>(null);
  const [name, setName] = useState("");
  const add = useMutation(PlaylistService.method.addToPlaylist, {
    onSuccess: (res) => {
      void refresh();
      setDone(res.playlist?.name ?? "");
    },
  });
  const create = useMutation(PlaylistService.method.createPlaylist, {
    onSuccess: (res) => {
      void refresh();
      setDone(res.playlist?.name ?? "");
    },
  });
  const error = add.error ?? create.error;
  // The chosen button disappears with the list: focus goes to the report, read aloud.
  const result = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (done !== null) result.current?.focus();
  }, [done]);

  return (
    <Dialog title={t("lists.addWhat", { what })} onClose={onClose}>
      {done !== null ? (
        <>
          <p ref={result} tabIndex={-1} className={styles.done}>
            {t("lists.added", { name: done })}
          </p>
          <Button variant="primary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </>
      ) : (
        <>
          {error && <Alert>{errorMessage(error)}</Alert>}
          {(lists.data?.playlists.length ?? 0) > 0 && (
            <ul className={styles.choices}>
              {lists.data?.playlists.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.choice}
                    disabled={add.isPending}
                    onClick={() => add.mutate({ playlistId: p.id, itemIds: [...itemIds] })}
                  >
                    <span className={styles.choiceName}>{p.name}</span>
                    <span className={styles.choiceMeta}>{playlistMeta(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className={styles.create}
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate({ name: name.trim(), itemIds: [...itemIds] });
            }}
          >
            <Field
              label={t("lists.newList")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("lists.newListPlaceholder")}
              maxLength={100}
            />
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {t("lists.createAndAdd")}
            </Button>
          </form>
        </>
      )}
    </Dialog>
  );
}
