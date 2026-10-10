import { useMutation, useQuery } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { ActivityService } from "../../gen/laterna/v1/activity_pb";
import { LibraryKind, LibraryService } from "../../gen/laterna/v1/library_pb";
import {
  type RequestDestination,
  RequestKind,
  RequestSeriesType,
  RequestService,
} from "../../gen/laterna/v1/request_pb";
import { num } from "../../i18n";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { requestKind, seriesTypes } from "../requests/requests";
import styles from "./admin.module.css";

/**
 * Where requests land (server: docs/design/requests.md): a library and, on Sonarr or Radarr, a root
 * folder, a quality profile and, for series, how episodes are numbered.
 */
export function RequestDestinations() {
  const { t } = useTranslation();
  const list = useQuery(RequestService.method.listRequestDestinations, {});
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState<RequestDestination | "new">();
  const [deleting, setDeleting] = useState<RequestDestination>();
  const remove = useMutation(RequestService.method.deleteRequestDestination, {
    onSuccess: async () => {
      setDeleting(undefined);
      await invalidate(RequestService, ActivityService);
    },
  });
  const destinations = list.data?.destinations ?? [];
  return (
    <section className={styles.card} aria-labelledby="request-destinations">
      <div className={styles.cardHead}>
        <h2 id="request-destinations" className={styles.cardTitle}>
          {t("adminRequests.destinations")}
        </h2>
        <button type="button" className={styles.dark} onClick={() => setEditing("new")}>
          {t("adminRequests.newDestination")}
        </button>
      </div>
      <p className={styles.muted}>{t("adminRequests.destinationsHint")}</p>
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      {list.isSuccess && destinations.length === 0 && (
        <p className={styles.warn}>{t("adminRequests.noDestination")}</p>
      )}
      <ul className={styles.rows}>
        {destinations.map((d) => {
          const kind = requestKind(d.kind);
          const type = seriesTypes.find((s) => s.value === d.seriesType);
          return (
            <li key={d.id} className={styles.libRow}>
              <span className={styles.dot} style={{ background: `var(--color-${kind.universe})` }} />
              <span className={styles.libText}>
                <span className={styles.libName}>{d.name}</span>
                <span className={styles.muted}>
                  {[
                    kind.label,
                    d.libraryName,
                    d.rootFolder,
                    d.qualityProfileName,
                    d.metadataProfileName,
                    d.kind === RequestKind.SERIES && type ? t(type.label) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.small}
                  aria-label={t("adminRequests.editLabel", { name: d.name })}
                  onClick={() => setEditing(d)}
                >
                  {t("common.edit")}
                </button>
                <button
                  type="button"
                  className={styles.small}
                  aria-label={t("adminRequests.deleteLabel", { name: d.name })}
                  onClick={() => setDeleting(d)}
                >
                  {t("common.delete")}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {editing && (
        <DestinationDialog
          destination={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {deleting && (
        <Dialog
          title={t("adminRequests.deleteTitle", { name: deleting.name })}
          onClose={() => setDeleting(undefined)}
        >
          <p>{t("adminRequests.deleteText")}</p>
          {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
          <div className={styles.actions}>
            <span className={styles.spacer} />
            <Button onClick={() => setDeleting(undefined)} data-autofocus>
              {t("common.keep")}
            </Button>
            <Button
              variant="primary"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ destinationId: deleting.id })}
            >
              {t("common.delete")}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** Kind of library each family of requests lands in. */
const libraryKinds: Partial<Record<RequestKind, LibraryKind>> = {
  [RequestKind.SERIES]: LibraryKind.SHOWS,
  [RequestKind.MOVIE]: LibraryKind.MOVIES,
  [RequestKind.MUSIC]: LibraryKind.MUSIC,
  [RequestKind.BOOK]: LibraryKind.BOOKS,
};

const freeSpace = (bytes: bigint) =>
  bytes > 0n ? ` · ${num(Number(bytes) / 2 ** 40, { maximumFractionDigits: 1 })} TiB` : "";

/** Creates or changes a destination; the kind of an existing one does not change. */
function DestinationDialog({
  destination: d,
  onClose,
}: {
  destination?: RequestDestination;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [kind, setKind] = useState(d?.kind ?? RequestKind.SERIES);
  const [name, setName] = useState(d?.name ?? "");
  const [libraryId, setLibraryId] = useState(d?.libraryId ?? "");
  const [rootFolder, setRootFolder] = useState(d?.rootFolder ?? "");
  const [profileId, setProfileId] = useState(d?.qualityProfileId ?? 0);
  const [metadataId, setMetadataId] = useState(d?.metadataProfileId ?? 0);
  const [seriesType, setSeriesType] = useState(d?.seriesType || RequestSeriesType.STANDARD);
  const libraryKind = libraryKinds[kind] ?? LibraryKind.SHOWS;
  // LazyLibrarian decides where books go: a book destination only names the library.
  const onInstance = kind !== RequestKind.BOOK;
  const libraries = (useQuery(LibraryService.method.listLibraries, {}).data?.libraries ?? []).flatMap((l) =>
    l.library && l.library.kind === libraryKind ? [l.library] : [],
  );
  const options = useQuery(RequestService.method.getRequestOptions, { kind });
  const roots = options.data?.rootFolders ?? [];
  const profiles = options.data?.qualityProfiles ?? [];
  const metadataProfiles = options.data?.metadataProfiles ?? [];
  const done = async () => {
    await invalidate(RequestService, ActivityService);
    onClose();
  };
  const create = useMutation(RequestService.method.createRequestDestination, { onSuccess: done });
  const update = useMutation(RequestService.method.updateRequestDestination, { onSuccess: done });
  const busy = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  // Choices still valid for the kind: the first library, folder and profile otherwise.
  const library = libraries.some((l) => l.id === libraryId) ? libraryId : (libraries[0]?.id ?? "");
  const root = roots.some((r) => r.path === rootFolder) ? rootFolder : (roots[0]?.path ?? "");
  const profile = profiles.some((p) => p.id === profileId) ? profileId : (profiles[0]?.id ?? 0);
  const metadata = metadataProfiles.some((p) => p.id === metadataId)
    ? metadataId
    : (metadataProfiles[0]?.id ?? 0);
  const complete =
    Boolean(name.trim() && library) &&
    (!onInstance || Boolean(root && profile)) &&
    (kind !== RequestKind.MUSIC || Boolean(metadata));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fields = {
      name: name.trim(),
      libraryId: library,
      ...(onInstance ? { rootFolder: root, qualityProfileId: profile } : {}),
      ...(kind === RequestKind.MUSIC ? { metadataProfileId: metadata } : {}),
      seriesType,
    };
    if (d) update.mutate({ destinationId: d.id, ...fields });
    else create.mutate({ kind, ...fields });
  };

  return (
    <Dialog
      title={d ? t("adminRequests.editTitle", { name: d.name }) : t("adminRequests.newDestination")}
      onClose={onClose}
      wide
    >
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={t("adminRequests.name")}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {!d && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>{t("adminRequests.kind")}</legend>
            <div className={styles.choices}>
              {[RequestKind.SERIES, RequestKind.MOVIE, RequestKind.MUSIC, RequestKind.BOOK].map((k) => (
                <button
                  key={k}
                  type="button"
                  className={styles.choice}
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                >
                  <span
                    className={styles.dot}
                    style={{ background: `var(--color-${requestKind(k).universe})` }}
                  />
                  {requestKind(k).label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className={styles.grid2Fields}>
          <label className={styles.selectField}>
            <span className={styles.label}>{t("adminRequests.library")}</span>
            <select className={styles.input} value={library} onChange={(e) => setLibraryId(e.target.value)}>
              {libraries.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {kind === RequestKind.SERIES && (
            <label className={styles.selectField}>
              <span className={styles.label}>{t("adminRequests.seriesType")}</span>
              <select
                className={styles.input}
                value={seriesType}
                onChange={(e) => setSeriesType(Number(e.target.value))}
              >
                {seriesTypes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(s.label)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {libraries.length === 0 && <p className={styles.warn}>{t("adminRequests.noLibrary")}</p>}
        {options.isError ? (
          <Alert>
            {errorMessage(options.error)}{" "}
            <Link to="/admin/sonarr-radarr" className={styles.link}>
              {t("adminNav.arr")}
            </Link>
          </Alert>
        ) : onInstance ? (
          <div className={styles.grid2Fields}>
            <label className={styles.selectField}>
              <span className={styles.label}>{t("adminRequests.rootFolder")}</span>
              <select className={styles.input} value={root} onChange={(e) => setRootFolder(e.target.value)}>
                {roots.map((r) => (
                  <option key={r.path} value={r.path}>
                    {r.path}
                    {freeSpace(r.freeSpace)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.selectField}>
              <span className={styles.label}>{t("adminRequests.qualityProfile")}</span>
              <select
                className={styles.input}
                value={profile}
                onChange={(e) => setProfileId(Number(e.target.value))}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {kind === RequestKind.MUSIC && (
              <label className={styles.selectField}>
                <span className={styles.label}>{t("adminRequests.metadataProfile")}</span>
                <select
                  className={styles.input}
                  value={metadata}
                  onChange={(e) => setMetadataId(Number(e.target.value))}
                >
                  {metadataProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ) : null}
        <p className={styles.muted}>
          {onInstance ? t("adminRequests.rootHint") : t("adminRequests.bookHint")}
        </p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <div className={styles.actions}>
          <span className={styles.spacer} />
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={busy || !complete}>
            {d ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
