import { useMutation, useQuery } from "@connectrpc/connect-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { type MediaRequest, type RequestAlbum, RequestService } from "../../gen/laterna/v1/request_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Switch } from "../../ui/Switch";
import { albumKind, albumKindLabel, albumKinds, kindName } from "./albums";
import styles from "./requests.module.css";

/**
 * The albums of a requested artist, to tick: the list Lidarr has once the request is approved.
 * Only the albums ticked are looked for. For the profile of the request, or an administrator.
 */
export function ChooseAlbumsDialog({
  request,
  onClose,
  onDone,
}: {
  request: MediaRequest;
  onClose: () => void;
  onDone: (request: MediaRequest) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const list = useQuery(RequestService.method.listRequestAlbums, { requestId: request.id });
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [kind, setKind] = useState("");
  const [future, setFuture] = useState(false);
  const choose = useMutation(RequestService.method.chooseRequestAlbums, {
    onSuccess: async (res) => {
      await invalidate(RequestService);
      if (res.request) onDone(res.request);
    },
  });
  const albums = list.data?.albums ?? [];
  const kinds = albumKinds(albums);
  const shown = kind ? albums.filter((a) => albumKind(a) === kind) : albums;
  // What Lidarr already has or looks for cannot be asked for again.
  const free = (a: RequestAlbum) => !a.available && !a.monitored;
  const toggle = (key: string) =>
    setPicked((before) => {
      const next = new Set(before);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const tick = (on: boolean) =>
    setPicked((before) => {
      const next = new Set(before);
      for (const a of shown.filter(free)) {
        if (on) next.add(a.key);
        else next.delete(a.key);
      }
      return next;
    });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    choose.mutate({ requestId: request.id, albumKeys: [...picked], futureAlbums: future });
  };

  return (
    <Dialog title={t("requests.choose.title", { title: request.title })} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <p className={styles.muted}>{t("requests.choose.hint")}</p>
        {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
        {list.isSuccess && albums.length === 0 && (
          <div className={styles.fieldset}>
            <p role="status">{t("requests.choose.empty")}</p>
            <div className={styles.actions}>
              <Button onClick={() => list.refetch()} disabled={list.isFetching}>
                {t("common.retry")}
              </Button>
            </div>
          </div>
        )}
        {albums.length > 0 && (
          <>
            {kinds.length > 1 && (
              <fieldset className={styles.fieldset}>
                <legend className={styles.label}>{t("requests.choose.kinds")}</legend>
                <div className={styles.choices}>
                  <button
                    type="button"
                    className={styles.choice}
                    aria-pressed={kind === ""}
                    onClick={() => setKind("")}
                  >
                    {t("requests.choose.everyKind")}
                  </button>
                  {kinds.map((k) => (
                    <button
                      key={k.kind}
                      type="button"
                      className={styles.choice}
                      aria-pressed={kind === k.kind}
                      onClick={() => setKind(k.kind)}
                    >
                      {kindName(k.kind)} ({k.count})
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.link} onClick={() => tick(true)}>
                {t("requests.choose.all")}
              </button>
              <button type="button" className={styles.link} onClick={() => tick(false)}>
                {t("requests.choose.none")}
              </button>
            </div>
            <ul className={styles.albums} aria-label={t("requests.choose.title", { title: request.title })}>
              {shown.map((a) => (
                <Album key={a.key} album={a} picked={picked.has(a.key)} onToggle={() => toggle(a.key)} />
              ))}
            </ul>
            <Switch
              label={t("requests.choose.future")}
              hint={t("requests.choose.futureHint")}
              on={future}
              onChange={setFuture}
            />
          </>
        )}
        {choose.isError && <Alert>{errorMessage(choose.error)}</Alert>}
        <div className={styles.actions}>
          <span className={styles.spacer} />
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={picked.size === 0 || choose.isPending}>
            {t("requests.choose.confirm", { count: picked.size })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** An album of the list: a box to tick, its title, when it came out and what it is. */
function Album({
  album: a,
  picked,
  onToggle,
}: {
  album: RequestAlbum;
  picked: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const taken = a.available || a.monitored;
  const meta = [
    a.year > 0 ? String(a.year) : "",
    albumKindLabel(a),
    a.trackCount > 0 ? t("counts.tracks", { count: a.trackCount }) : "",
    a.available ? t("requests.choose.here") : a.monitored ? t("requests.choose.monitored") : "",
  ].filter(Boolean);
  return (
    <li>
      <label className={styles.album} data-taken={taken || undefined}>
        <input type="checkbox" checked={picked || taken} disabled={taken} onChange={onToggle} />
        <span className={styles.albumText}>
          <span className={styles.albumTitle}>{a.title}</span>
          {meta.length > 0 && <span className={styles.muted}>{meta.join(" · ")}</span>}
        </span>
      </label>
    </li>
  );
}
