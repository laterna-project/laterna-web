import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { MovieCard, SeriesCard } from "../../features/catalog/cards";
import { ItemSearch } from "../../features/catalog/ItemSearch";
import styles from "../../features/lists/collections.module.css";
import { Mosaic } from "../../features/lists/Mosaic";
import { CatalogService } from "../../gen/laterna/v1/catalog_pb";
import { type Collection, CollectionService } from "../../gen/laterna/v1/collection_pb";
import { HomeService } from "../../gen/laterna/v1/home_pb";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { Icon } from "../../ui/Icon";

export const Route = createFileRoute("/_app/collections")({
  validateSearch: (search: Record<string, unknown>): { collection?: string } =>
    typeof search.collection === "string" && search.collection ? { collection: search.collection } : {},
  component: Collections,
});

/** Refetches the collections, and what shows them (detail pages, home). */
function useRefreshCollections() {
  const invalidate = useInvalidate();
  return () => invalidate(CollectionService, CatalogService, HomeService);
}

function Collections() {
  const { t } = useTranslation();
  const { collection } = Route.useSearch();
  const { session } = Route.useRouteContext();
  const admin = Boolean(session.account?.isAdmin);
  const navigate = useNavigate({ from: Route.fullPath });
  const list = useQuery(CollectionService.method.listCollections, { libraryId: "" });
  const all = list.data?.collections ?? [];
  const chosen = collection ?? all[0]?.id;
  const [creating, setCreating] = useState(false);

  if (list.isError) return <Alert>{errorMessage(list.error)}</Alert>;
  return (
    <div className={styles.page}>
      <section className={styles.head} data-ui="page-header" data-universe="collections">
        <div>
          <h1 className={styles.title}>{t("nav.collections")}</h1>
          <p className={styles.subtitle}>{t("collections.subtitle")}</p>
        </div>
        <span className={styles.spacer} />
        {admin && (
          <button type="button" className={styles.create} onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            {t("collections.new")}
          </button>
        )}
      </section>

      {all.length === 0 && !list.isPending ? (
        <p className={styles.empty}>{admin ? t("collections.emptyAdmin") : t("collections.empty")}</p>
      ) : (
        <ul className={styles.cards}>
          {all.map((c) => (
            <li key={c.id}>
              <CollectionCard collection={c} current={c.id === chosen} />
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <CollectionView
          key={chosen}
          id={chosen}
          admin={admin}
          onDeleted={() => void navigate({ search: {}, replace: true })}
        />
      )}

      {creating && (
        <EditDialog
          title={t("collections.new")}
          action={t("common.create")}
          onClose={() => setCreating(false)}
          onCreated={(id) => void navigate({ search: { collection: id }, replace: true })}
        />
      )}
    </div>
  );
}

function CollectionCard({ collection: c, current }: { collection: Collection; current: boolean }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/collections"
      search={{ collection: c.id }}
      className={styles.card}
      data-ui="card"
      data-kind="collection"
      data-universe="collections"
      aria-current={current ? "page" : undefined}
      activeOptions={{ exact: true, includeSearch: true }}
      resetScroll={false}
      replace
    >
      <Mosaic images={c.images} size="large" />
      <span className={styles.cardName}>{c.name}</span>
      <span className={styles.cardMeta}>
        {t("catalog.titles", { count: c.itemCount })}
        <span className={styles.tag} data-manual={c.manual}>
          {c.manual ? t("collections.selection") : t("collections.saga")}
        </span>
      </span>
    </Link>
  );
}

function CollectionView({ id, admin, onDeleted }: { id: string; admin: boolean; onDeleted: () => void }) {
  const { t } = useTranslation();
  const query = useQuery(CollectionService.method.getCollection, { collectionId: id });
  const refresh = useRefreshCollections();
  const [dialog, setDialog] = useState<"name" | "overview" | "add" | "delete" | null>(null);
  const update = useMutation(CollectionService.method.updateCollection, { onSuccess: () => void refresh() });
  const del = useMutation(CollectionService.method.deleteCollection, {
    onSuccess: () => {
      void refresh();
      onDeleted();
    },
  });

  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const c = query.data?.collection;
  if (!c) return <section className={styles.panel} aria-busy="true" />;
  const items = query.data?.items ?? [];
  const editable = admin && c.manual;

  return (
    <section className={styles.panel} aria-labelledby="collection-name">
      <div className={styles.panelHead}>
        <div className={styles.panelInfo}>
          <span className={styles.kicker}>
            {c.manual ? t("collections.selectionKicker") : t("collections.sagaKicker")}
          </span>
          <h2 id="collection-name" className={styles.panelTitle}>
            {c.name}
          </h2>
          {c.overview && <p className={styles.overview}>{c.overview}</p>}
        </div>
        {editable && (
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => setDialog("name")}>
              {t("collections.rename")}
            </button>
            <button type="button" className={styles.action} onClick={() => setDialog("overview")}>
              {t("collections.editOverview")}
            </button>
            <button type="button" className={styles.action} onClick={() => setDialog("add")}>
              <Icon name="plus" size={14} />
              {t("collections.addItems")}
            </button>
            <button type="button" className={styles.actionDanger} onClick={() => setDialog("delete")}>
              {t("collections.delete")}
            </button>
          </div>
        )}
      </div>
      {update.isError && <Alert>{errorMessage(update.error)}</Alert>}

      {items.length === 0 ? (
        <p className={styles.empty}>{t("collections.isEmpty")}</p>
      ) : (
        <ul className={styles.items}>
          {items.map((it) =>
            it.item.case ? (
              <li key={it.item.value.id} className={styles.item}>
                {it.item.case === "movie" ? (
                  <MovieCard movie={it.item.value} />
                ) : (
                  <SeriesCard series={it.item.value} />
                )}
                {editable && (
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() =>
                      update.mutate({ collectionId: id, removeItemIds: [it.item.value?.id ?? ""] })
                    }
                    aria-label={t("collections.remove", { title: it.item.value.title })}
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </li>
            ) : null,
          )}
        </ul>
      )}

      {(dialog === "name" || dialog === "overview") && (
        <EditDialog
          title={dialog === "name" ? t("collections.renameTitle") : t("collections.overviewTitle")}
          action={t("common.save")}
          collection={c}
          field={dialog}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "add" && (
        <Dialog title={t("collections.addTo", { name: c.name })} onClose={() => setDialog(null)}>
          {update.isSuccess && <p className={styles.added}>{t("collections.added")}</p>}
          <ItemSearch
            label={t("collections.searchLabel")}
            placeholder={t("collections.searchPlaceholder")}
            accept={["movie", "series"]}
            autoFocus
            busy={update.isPending}
            onPick={(it) => update.mutate({ collectionId: id, addItemIds: [it.value.id] })}
          />
        </Dialog>
      )}
      {dialog === "delete" && (
        <Dialog title={t("collections.deleteTitle")} onClose={() => setDialog(null)}>
          <p>{t("collections.deleteText", { name: c.name })}</p>
          {del.isError && <Alert>{errorMessage(del.error)}</Alert>}
          <div className={styles.dialogActions}>
            <Button onClick={() => setDialog(null)}>{t("common.keep")}</Button>
            <Button
              variant="primary"
              onClick={() => del.mutate({ collectionId: id })}
              disabled={del.isPending}
            >
              {t("common.delete")}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** Creating a hand-made collection, or changing its name or overview. */
function EditDialog({
  title,
  action,
  collection,
  field,
  onClose,
  onCreated,
}: {
  title: string;
  action: string;
  collection?: Collection;
  field?: "name" | "overview";
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(collection?.name ?? "");
  const [overview, setOverview] = useState(collection?.overview ?? "");
  const overviewId = useId();
  const refresh = useRefreshCollections();
  const done = () => {
    void refresh();
    onClose();
  };
  const create = useMutation(CollectionService.method.createCollection, {
    onSuccess: (r) => {
      done();
      if (r.collection) onCreated?.(r.collection.id);
    },
  });
  const update = useMutation(CollectionService.method.updateCollection, { onSuccess: done });
  const error = create.error ?? update.error;
  const showName = !collection || field === "name";
  const showOverview = !collection || field === "overview";

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!collection) create.mutate({ name: name.trim(), overview: overview.trim(), itemIds: [] });
          else if (field === "name") update.mutate({ collectionId: collection.id, name: name.trim() });
          else update.mutate({ collectionId: collection.id, overview: overview.trim() });
        }}
      >
        {error && <Alert>{errorMessage(error)}</Alert>}
        {showName && (
          <Field
            label={t("collections.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            data-autofocus
          />
        )}
        {showOverview && (
          <div className={styles.textarea}>
            <label htmlFor={overviewId}>{t("collections.overview")}</label>
            <textarea
              id={overviewId}
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              rows={4}
            />
          </div>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={(showName && !name.trim()) || create.isPending || update.isPending}
        >
          {action}
        </Button>
      </form>
    </Dialog>
  );
}
