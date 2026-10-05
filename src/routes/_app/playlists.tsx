import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { formatClock, formatRuntime, seconds } from "../../api/media";
import { relativeDay } from "../../features/catalog/format";
import { ItemSearch } from "../../features/catalog/ItemSearch";
import { useRefreshPlaylists } from "../../features/lists/AddToPlaylist";
import { entryView, moved, playlistMeta } from "../../features/lists/entries";
import styles from "../../features/lists/lists.module.css";
import { Mosaic } from "../../features/lists/Mosaic";
import { type PlaylistEntry, PlaylistService } from "../../gen/laterna/v1/playlist_pb";
import { num } from "../../i18n";
import { useMusic } from "../../music/MusicProvider";
import { StartParty } from "../../party/StartParty";
import { Alert } from "../../ui/Alert";
import { Artwork } from "../../ui/Artwork";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { Icon } from "../../ui/Icon";

/** Maximum entries and playlists (server). */
const maxEntries = 2000;
const maxLists = 100;

export const Route = createFileRoute("/_app/playlists")({
  validateSearch: (search: Record<string, unknown>): { playlist?: string } =>
    typeof search.playlist === "string" && search.playlist ? { playlist: search.playlist } : {},
  component: Lists,
});

function Lists() {
  const { t } = useTranslation();
  const { playlist } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const lists = useQuery(PlaylistService.method.listPlaylists, {});
  const all = lists.data?.playlists ?? [];
  const chosen = playlist ?? all[0]?.id;
  const [creating, setCreating] = useState(false);

  if (lists.isError) return <Alert>{errorMessage(lists.error)}</Alert>;
  return (
    <div className={styles.layout}>
      <aside className={styles.side} aria-label={t("lists.sideLabel")} data-ui="side-panel">
        <div className={styles.sideHead}>
          <span className={styles.sideTitleBox}>
            <span className={styles.sideTitle}>{t("lists.sideTitle")}</span>
            <span className={styles.sideMeta}>{t("lists.countOf", { n: all.length, max: maxLists })}</span>
          </span>
          <button
            type="button"
            className={styles.newList}
            onClick={() => setCreating(true)}
            disabled={all.length >= maxLists}
          >
            <Icon name="plus" size={14} />
            {t("lists.new")}
          </button>
        </div>
        {all.map((p) => (
          <Link
            key={p.id}
            to="/playlists"
            search={{ playlist: p.id }}
            className={styles.listCard}
            data-ui="card"
            data-kind="playlist"
            data-universe="playlists"
            aria-current={p.id === chosen ? "page" : undefined}
            activeOptions={{ exact: true, includeSearch: true }}
          >
            <Mosaic images={p.images} size="small" />
            <span className={styles.listText}>
              <span className={styles.listName}>{p.name}</span>
              <span className={styles.listMeta}>{playlistMeta(p)}</span>
            </span>
          </Link>
        ))}
        {all.length === 0 && !lists.isPending && <p className={styles.empty}>{t("lists.empty")}</p>}
      </aside>

      {chosen ? (
        <PlaylistView
          key={chosen}
          id={chosen}
          onDeleted={() => void navigate({ search: {}, replace: true })}
        />
      ) : (
        // No playlist to show yet: the page still needs its h1 (tab title, focus after navigation).
        <section className={styles.main}>
          <h1 className="sr-only">{t("lists.sideTitle")}</h1>
        </section>
      )}

      {creating && (
        <NameDialog
          title={t("lists.newList")}
          action={t("lists.create")}
          initial=""
          onClose={() => setCreating(false)}
          onDone={(id) => void navigate({ search: { playlist: id }, replace: true })}
        />
      )}
    </div>
  );
}

/** Name of a playlist: creation or change. */
function NameDialog({
  title,
  action,
  initial,
  playlistId,
  onClose,
  onDone,
}: {
  title: string;
  action: string;
  initial: string;
  playlistId?: string;
  onClose: () => void;
  onDone?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const refresh = useRefreshPlaylists();
  const done = (id: string | undefined) => {
    void refresh();
    if (id) onDone?.(id);
    onClose();
  };
  const create = useMutation(PlaylistService.method.createPlaylist, {
    onSuccess: (r) => done(r.playlist?.id),
  });
  const rename = useMutation(PlaylistService.method.renamePlaylist, {
    onSuccess: (r) => done(r.playlist?.id),
  });
  const error = create.error ?? rename.error;
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          if (playlistId) rename.mutate({ playlistId, name: n });
          else create.mutate({ name: n, itemIds: [] });
        }}
      >
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Field
          label={t("lists.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          data-autofocus
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!name.trim() || create.isPending || rename.isPending}
        >
          {action}
        </Button>
      </form>
    </Dialog>
  );
}

function PlaylistView({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { t } = useTranslation();
  const query = useQuery(PlaylistService.method.getPlaylist, { playlistId: id });
  const refresh = useRefreshPlaylists();
  const navigate = useNavigate();
  const music = useMusic();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Order moved here, shown before the server answers.
  const [order, setOrder] = useState<PlaylistEntry[] | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const data = query.data;
  // The server's data arrived: the local order no longer applies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggered by the arrival of the data.
  useEffect(() => setOrder(null), [data]);

  const opts = { onSuccess: () => void refresh() };
  const remove = useMutation(PlaylistService.method.removeFromPlaylist, opts);
  const move = useMutation(PlaylistService.method.movePlaylistEntry, opts);
  const add = useMutation(PlaylistService.method.addToPlaylist, opts);
  const del = useMutation(PlaylistService.method.deletePlaylist, {
    onSuccess: () => {
      void refresh();
      onDeleted();
    },
  });
  const error = remove.error ?? move.error ?? add.error ?? del.error;

  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const p = data?.playlist;
  if (!p) return <section className={styles.main} aria-busy="true" />;
  const entries = order ?? data.entries;

  const moveTo = (from: number, to: number) => {
    const e = entries[from];
    if (!e || to < 0 || to >= entries.length || to === from) return;
    setOrder(moved(entries, from, to));
    move.mutate({ playlistId: id, entryId: e.id, position: to });
  };

  // Play from an entry: tracks go to the music player, movies and episodes to the video player,
  // which continues with the next videos of the playlist.
  const play = (i: number) => {
    const e = entries[i];
    if (!e) return;
    if (e.item.case === "track") {
      const tracks = entries.flatMap((x) => (x.item.case === "track" ? [x.item.value] : []));
      music.play(tracks, entries.slice(0, i).filter((x) => x.item.case === "track").length);
    } else if (e.item.case === "movie")
      void navigate({
        to: "/play/movie/$id",
        params: { id: e.item.value.id },
        search: { playlist: id, entry: e.id },
      });
    else if (e.item.case === "episode")
      void navigate({
        to: "/play/episode/$id",
        params: { id: e.item.value.id },
        search: { playlist: id, entry: e.id },
      });
  };

  const updated = p.updatedAt ? new Date(Number(p.updatedAt.seconds) * 1000) : undefined;

  return (
    <section className={styles.main} aria-labelledby="playlist-name">
      <div className={styles.titleRow}>
        <h1 id="playlist-name" className={styles.title}>
          {p.name}
        </h1>
        <button
          type="button"
          className={styles.roundSoft}
          onClick={() => setRenaming(true)}
          aria-label={t("lists.rename")}
        >
          <Icon name="pencil" size={16} />
        </button>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.playAll}
          onClick={() => play(0)}
          disabled={entries.length === 0}
        >
          <Icon name="play" size={13} />
          {t("lists.playAll")}
        </button>
        <StartParty
          itemIds={entries.flatMap((e) => (e.item.value ? [e.item.value.id] : []))}
          className={styles.party}
        >
          <Icon name="people" size={16} />
          {t("lists.together")}
        </StartParty>
        <button
          type="button"
          className={styles.danger}
          onClick={() => setDeleting(true)}
          aria-label={t("lists.delete")}
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
      <p className={styles.meta}>
        {[
          t("lists.entriesOf", { count: p.entryCount, max: num(maxEntries) }),
          seconds(p.duration) > 0 ? formatRuntime(seconds(p.duration)) : "",
          updated ? t("lists.modified", { when: relativeDay(updated) }) : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {error && <Alert>{errorMessage(error)}</Alert>}

      <ol className={styles.entries}>
        {entries.map((e, i) => {
          const v = entryView(e);
          if (!v) return null;
          return (
            <li
              key={e.id}
              className={styles.entry}
              data-ui="playlist-entry"
              data-dragged={dragged === i}
              draggable
              onDragStart={(ev) => {
                setDragged(i);
                ev.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(ev) => {
                ev.preventDefault();
                if (dragged !== null && dragged !== i) {
                  setOrder(moved(entries, dragged, i));
                  setDragged(i);
                }
              }}
              onDragEnd={() => {
                const from = data.entries.findIndex((x) => x.id === entries[dragged ?? -1]?.id);
                if (dragged !== null && from >= 0 && from !== dragged) {
                  const entry = data.entries[from];
                  if (entry) move.mutate({ playlistId: id, entryId: entry.id, position: dragged });
                }
                setDragged(null);
              }}
            >
              <button
                type="button"
                className={styles.grip}
                aria-label={t("lists.move", { title: v.title })}
                onKeyDown={(ev) => {
                  if (ev.key === "ArrowUp") moveTo(i, i - 1);
                  else if (ev.key === "ArrowDown") moveTo(i, i + 1);
                  else return;
                  ev.preventDefault();
                }}
              >
                <Icon name="grip" size={18} />
              </button>
              <span className={styles.number}>{i + 1}</span>
              <button type="button" className={styles.entryMain} onClick={() => play(i)}>
                <Artwork
                  image={v.image}
                  sizes="60px"
                  ratio={v.kind === "movie" ? 2 / 3 : v.kind === "episode" ? 16 / 9 : 1}
                  universe={v.universe}
                  fallback={v.title}
                  shape={v.kind === "track" ? "round" : "card"}
                  className={
                    v.kind === "movie"
                      ? styles.thumbTall
                      : v.kind === "episode"
                        ? styles.thumbWide
                        : styles.thumbRound
                  }
                />
                <span className={styles.entryText}>
                  <span className={styles.entryTitle}>{v.title}</span>
                  <span className={styles.entrySub}>{v.sub}</span>
                </span>
              </button>
              <span className={styles.kind}>
                <span className={styles.dot} style={{ background: `var(--color-${v.universe})` }} />
                {t(`kinds.${v.kind}`)}
              </span>
              <span className={styles.time}>{v.runtime > 0 ? formatClock(v.runtime) : ""}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => remove.mutate({ playlistId: id, entryIds: [e.id] })}
                aria-label={t("lists.remove", { title: v.title })}
              >
                <Icon name="close" size={11} />
              </button>
            </li>
          );
        })}
      </ol>

      <div className={styles.addBox}>
        <ItemSearch
          label={t("lists.addToList")}
          placeholder={t("lists.addPlaceholder")}
          accept={["movie", "episode", "series", "track", "album", "artist"]}
          busy={add.isPending || p.entryCount >= maxEntries}
          onPick={(it) => add.mutate({ playlistId: id, itemIds: [it.value.id] })}
        />
      </div>

      {renaming && (
        <NameDialog
          title={t("lists.rename")}
          action={t("lists.renameAction")}
          initial={p.name}
          playlistId={id}
          onClose={() => setRenaming(false)}
        />
      )}
      {deleting && (
        <Dialog title={t("lists.deleteTitle")} onClose={() => setDeleting(false)}>
          <p>{t("lists.deleteText", { name: p.name })}</p>
          <div className={styles.dialogActions}>
            <Button onClick={() => setDeleting(false)}>{t("common.keep")}</Button>
            <Button variant="primary" onClick={() => del.mutate({ playlistId: id })} disabled={del.isPending}>
              {t("common.delete")}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
