import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { onLibraryScanned } from "../../../api/events";
import { useInvalidate } from "../../../api/invalidate";
import { libraryCounts, libraryKind } from "../../../features/admin/admin";
import styles from "../../../features/admin/admin.module.css";
import { LibraryEditor } from "../../../features/admin/LibraryEditor";
import { AdminHead } from "../../../features/admin/ui";
import { languageName, relativeTime } from "../../../features/catalog/format";
import { CatalogService } from "../../../gen/laterna/v1/catalog_pb";
import type { LibraryScanned } from "../../../gen/laterna/v1/events_pb";
import { HomeService } from "../../../gen/laterna/v1/home_pb";
import { LibraryKind, LibraryService } from "../../../gen/laterna/v1/library_pb";
import { universeBlock } from "../../../theme/universe";
import { Alert } from "../../../ui/Alert";
import { Icon } from "../../../ui/Icon";

interface Search {
  /** Library open in the editor, or "new". */
  library?: string;
}

export const Route = createFileRoute("/_app/admin/libraries")({
  validateSearch: (s: Record<string, unknown>): Search =>
    typeof s.library === "string" ? { library: s.library } : {},
  component: Libraries,
});

/** Libraries: cards by kind, the editor next to them. */
function Libraries() {
  const { t } = useTranslation();
  const { library } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const list = useQuery(LibraryService.method.listLibraries, {});
  const invalidate = useInvalidate();
  // Order moved here, shown before the server answers (ReorderLibraries, server:
  // docs/design/library.md): the order of the lists and, kind by kind, of the recently added rows
  // on the home page.
  const [order, setOrder] = useState<string[] | null>(null);
  const reorder = useMutation(LibraryService.method.reorderLibraries, {
    onSuccess: async () => {
      await invalidate(LibraryService, CatalogService, HomeService);
      setOrder(null);
    },
    onError: () => setOrder(null),
  });
  const all = list.data?.libraries ?? [];
  const libraries = order ? order.flatMap((id) => all.filter((s) => s.library?.id === id)) : all;
  const move = (id: string, by: -1 | 1) => {
    const ids = libraries.map((s) => s.library?.id ?? "");
    const i = ids.indexOf(id);
    const j = i + by;
    const other = ids[j];
    // One move at a time; the buttons stay enabled so that they keep focus.
    if (reorder.isPending || i < 0 || other === undefined) return;
    ids[j] = id;
    ids[i] = other;
    setOrder(ids);
    reorder.mutate({ libraryIds: ids });
    // The card moves: focus follows it, on the button that is still usable.
    requestAnimationFrame(() => {
      const same = document.getElementById(
        `${by < 0 ? "before" : "after"}-${id}`,
      ) as HTMLButtonElement | null;
      (same && !same.disabled
        ? same
        : document.getElementById(`${by < 0 ? "after" : "before"}-${id}`)
      )?.focus();
    });
  };
  const selected = libraries.find((l) => l.library?.id === library)?.library;
  const open = (id: string | undefined) => navigate({ search: id ? { library: id } : {}, replace: true });
  // Reports of the last finished scans, announced by the event stream.
  const [scans, setScans] = useState<{ at: number; scan: LibraryScanned }[]>([]);
  // Scans requested from here, until they finish.
  const [asked, setAsked] = useState<string[]>([]);
  useEffect(
    () =>
      onLibraryScanned((scan) => {
        setScans((all) => [{ at: Date.now(), scan }, ...all].slice(0, 3));
        setAsked((ids) => ids.filter((id) => id !== scan.libraryId));
      }),
    [],
  );
  const scan = useMutation(LibraryService.method.scanLibrary, {
    onSuccess: (_, req) => setAsked((a) => [...a, req.libraryId ?? ""]),
  });
  const nameOf = (id: string) =>
    libraries.find((l) => l.library?.id === id)?.library?.name ?? t("adminLibraries.someLibrary");

  return (
    <>
      <AdminHead title={t("adminLibraries.title")} sub={t("adminLibraries.subtitle")}>
        <button type="button" className={styles.dark} onClick={() => open("new")}>
          {t("adminLibraries.new")}
        </button>
      </AdminHead>
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      {scan.isError && <Alert>{errorMessage(scan.error)}</Alert>}
      {reorder.isError && <Alert>{errorMessage(reorder.error)}</Alert>}
      {scans.map(({ at, scan: s }) => (
        <p key={`${at}-${s.libraryId}`} className={styles.banner} role="status">
          <span className={styles.bannerMark} aria-hidden="true">
            ✓
          </span>
          <span>
            <strong>{t("adminLibraries.scanDone", { name: nameOf(s.libraryId) })}</strong> ·{" "}
            {[
              t("adminLibraries.files", { count: s.files }),
              t("adminLibraries.added", { count: s.added }),
              t("adminLibraries.changed", { count: s.changed }),
              t("adminLibraries.moved", { count: s.moved }),
              t("adminLibraries.missing", { count: s.missing }),
              s.returned ? t("adminLibraries.returned", { count: s.returned }) : "",
              s.forgotten ? t("adminLibraries.forgotten", { count: s.forgotten }) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {s.added + s.changed > 0 && (
            <span className={styles.muted}>{t("adminLibraries.analysisContinues")}</span>
          )}
        </p>
      ))}
      <div className={styles.split}>
        <ul className={styles.libCards}>
          {libraries.map(({ library: l, counts }, index) => {
            if (!l) return null;
            const k = libraryKind(l.kind);
            const last = l.lastScanAt ? new Date(Number(l.lastScanAt.seconds) * 1000) : undefined;
            return (
              <li
                key={l.id}
                className={styles.libCard}
                aria-current={l.id === library || undefined}
                style={universeBlock(k.universe)}
              >
                <span className={styles.libCardTop}>
                  <span className={styles.libChip}>{k.label}</span>
                  <span>
                    {asked.includes(l.id)
                      ? t("adminLibraries.scanRequested")
                      : last
                        ? t("adminLibraries.scannedWhen", { when: relativeTime(last) })
                        : t("adminLibraries.neverScanned")}
                  </span>
                </span>
                <span className={styles.libCardName}>{l.name}</span>
                <span className={styles.libCardCounts}>{libraryCounts(l.kind, counts)}</span>
                <span className={styles.libCardPaths}>
                  {[
                    l.paths.join(", "),
                    l.kind === LibraryKind.PHOTOS
                      ? t("adminLibraries.exif")
                      : languageName(l.language.slice(0, 2)),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className={styles.libCardActions}>
                  <button
                    type="button"
                    className={styles.onColor}
                    disabled={scan.isPending}
                    onClick={() => scan.mutate({ libraryId: l.id })}
                    aria-label={t("adminLibraries.scanLabel", { name: l.name })}
                  >
                    {t("adminLibraries.scan")}
                  </button>
                  <button
                    type="button"
                    className={styles.onColorQuiet}
                    onClick={() => open(l.id)}
                    aria-label={t("adminLibraries.editLabel", { name: l.name })}
                  >
                    {t("common.edit")}
                  </button>
                  <span className={styles.spacer} />
                  <button
                    type="button"
                    id={`before-${l.id}`}
                    className={styles.onColorQuiet}
                    disabled={index === 0}
                    onClick={() => move(l.id, -1)}
                    aria-label={t("adminLibraries.moveBefore", { name: l.name })}
                    title={t("adminLibraries.moveBefore", { name: l.name })}
                  >
                    <Icon name="back" size={14} />
                  </button>
                  <button
                    type="button"
                    id={`after-${l.id}`}
                    className={styles.onColorQuiet}
                    disabled={index === libraries.length - 1}
                    onClick={() => move(l.id, 1)}
                    aria-label={t("adminLibraries.moveAfter", { name: l.name })}
                    title={t("adminLibraries.moveAfter", { name: l.name })}
                  >
                    <Icon name="chevron" size={14} />
                  </button>
                </span>
              </li>
            );
          })}
          {list.isSuccess && libraries.length === 0 && (
            <li className={styles.muted}>{t("adminLibraries.none")}</li>
          )}
        </ul>
        {library === "new" || selected ? (
          <LibraryEditor
            key={library}
            library={selected}
            onSaved={(id) => open(id)}
            onDeleted={() => open(undefined)}
          />
        ) : (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("adminLibraries.oneKind")}</h2>
            <p className={styles.muted}>{t("adminLibraries.oneKindText")}</p>
            <p className={styles.muted}>{t("adminLibraries.orderHint")}</p>
            <p className={styles.muted}>{t("adminLibraries.pick")}</p>
          </section>
        )}
      </div>
    </>
  );
}
