import { useMutation } from "@connectrpc/connect-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { CatalogService } from "../../gen/laterna/v1/catalog_pb";
import { type Library, LibraryKind, LibraryService } from "../../gen/laterna/v1/library_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { scrollBehavior } from "../../ui/motion";
import { Status } from "../../ui/Status";
import { libraryKind, libraryKinds, metadataLanguages, metadataTag } from "./admin";
import styles from "./admin.module.css";
import { BrowseButton } from "./FolderPicker";

/**
 * Create or edit a library: name, kind (at creation only), folders as the server sees them,
 * metadata language; delete.
 */
export function LibraryEditor({
  library,
  onSaved,
  onDeleted,
}: {
  library: Library | undefined;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  // On a narrow screen the editor goes under the list: bring it into view when it opens.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    void panel.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, []);
  const [name, setName] = useState(library?.name ?? "");
  const [kind, setKind] = useState(library?.kind ?? LibraryKind.MOVIES);
  const [paths, setPaths] = useState(() =>
    (library?.paths.length ? library.paths : [""]).map((value, key) => ({ key, value })),
  );
  const [nextKey, setNextKey] = useState(paths.length);
  const [language, setLanguage] = useState(library?.language || metadataTag());
  const [deleting, setDeleting] = useState(false);
  // Report of the last save: changing the folders starts a scan.
  const [saved, setSaved] = useState<"" | "ok" | "scan">("");
  const refresh = () => invalidate(LibraryService, CatalogService);
  const createLibrary = useMutation(LibraryService.method.createLibrary, {
    onSuccess: async (res) => {
      await refresh();
      if (res.library) onSaved(res.library.id);
    },
  });
  const updateLibrary = useMutation(LibraryService.method.updateLibrary, {
    onSuccess: async (_, req) => {
      await refresh();
      setSaved(req.paths?.length ? "scan" : "ok");
    },
  });
  const deleteLibrary = useMutation(LibraryService.method.deleteLibrary, {
    onSuccess: async () => {
      setDeleting(false);
      await refresh();
      onDeleted();
    },
  });
  const k = libraryKind(kind);
  const list = paths.map((p) => p.value.trim()).filter(Boolean);
  const pathsChanged = list.join("\n") !== (library?.paths ?? []).join("\n");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved("");
    if (!library) {
      createLibrary.mutate({ name: name.trim(), kind, paths: list, language });
      return;
    }
    updateLibrary.mutate({
      libraryId: library.id,
      name: name.trim() !== library.name ? name.trim() : undefined,
      paths: pathsChanged ? list : [],
      language: language !== library.language ? language : undefined,
    });
  };
  const error = createLibrary.error ?? updateLibrary.error;

  return (
    <section ref={panel} className={styles.panel} aria-labelledby="chosen-library">
      <span
        className={styles.panelChip}
        style={{ background: `var(--color-${k.universe})`, color: `var(--color-${k.universe}-ink)` }}
      >
        {library ? t("libraryEditor.edit") : t("libraryEditor.new")}
      </span>
      <h2 id="chosen-library" className={styles.panelTitle}>
        {library?.name || t("libraryEditor.newLibrary")}
      </h2>
      <form className={styles.form} onSubmit={submit}>
        <Field
          label={t("libraryEditor.name")}
          required
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        {!library && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>{t("libraryEditor.content")}</legend>
            <div className={styles.choices}>
              {libraryKinds.map((x) => (
                <button
                  key={x.kind}
                  type="button"
                  className={styles.choice}
                  aria-pressed={kind === x.kind}
                  onClick={() => setKind(x.kind)}
                >
                  <span className={styles.dot} style={{ background: `var(--color-${x.universe})` }} />
                  {x.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>
            {t("libraryEditor.folders")}{" "}
            {library && <span className={styles.muted}>{t("libraryEditor.foldersRescan")}</span>}
          </legend>
          <div className={styles.paths}>
            {paths.map((p, i) => (
              <span key={p.key} className={styles.path}>
                <input
                  className={styles.input}
                  aria-label={t("libraryEditor.folder", { n: i + 1 })}
                  placeholder={i === 0 ? "/media/movies" : ""}
                  required={i === 0}
                  value={p.value}
                  onChange={(e) =>
                    setPaths(paths.map((q) => (q.key === p.key ? { ...q, value: e.target.value } : q)))
                  }
                />
                <BrowseButton
                  value={p.value}
                  libraryId={library?.id}
                  label={t("libraryEditor.browse", { n: i + 1 })}
                  onPick={(value) => setPaths(paths.map((q) => (q.key === p.key ? { ...q, value } : q)))}
                />
                {paths.length > 1 && (
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={t("libraryEditor.removeFolder", { n: i + 1 })}
                    onClick={() => setPaths(paths.filter((q) => q.key !== p.key))}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setPaths([...paths, { key: nextKey, value: "" }]);
                setNextKey(nextKey + 1);
              }}
            >
              {t("libraryEditor.addFolder")}
            </button>
          </div>
        </fieldset>
        {kind !== LibraryKind.PHOTOS && (
          <label className={styles.selectField}>
            <span className={styles.label}>{t("libraryEditor.language")}</span>
            <select className={styles.input} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {metadataLanguages().map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
              {/* A language set elsewhere (another region, another language) is still offered as is. */}
              {!metadataLanguages().some((l) => l.value === language) && (
                <option value={language}>{language}</option>
              )}
            </select>
          </label>
        )}
        <p className={styles.note}>{t("libraryEditor.note")}</p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Status
          className={styles.ok}
          message={saved === "scan" ? t("libraryEditor.savedScan") : saved ? t("libraryEditor.saved") : ""}
        />
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={!name.trim() || list.length === 0 || createLibrary.isPending || updateLibrary.isPending}
          >
            {library ? t("common.save") : t("libraryEditor.createScan")}
          </Button>
          <span className={styles.spacer} />
          {library && (
            <button type="button" className={styles.danger} onClick={() => setDeleting(true)}>
              {t("common.delete")}
            </button>
          )}
        </div>
      </form>

      {deleting && library && (
        <Dialog
          title={t("libraryEditor.deleteTitle", { name: library.name })}
          onClose={() => setDeleting(false)}
        >
          <p>{t("libraryEditor.deleteText")}</p>
          {deleteLibrary.isError && <Alert>{errorMessage(deleteLibrary.error)}</Alert>}
          <div className={styles.actions}>
            <span className={styles.spacer} />
            <Button onClick={() => setDeleting(false)} data-autofocus>
              {t("common.keep")}
            </Button>
            <Button
              variant="primary"
              disabled={deleteLibrary.isPending}
              onClick={() => deleteLibrary.mutate({ libraryId: library.id })}
            >
              {t("common.delete")}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
