import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ItemSort } from "../../gen/laterna/v1/catalog_pb";
import type { Universe } from "../../theme/contract";
import { universeBlock } from "../../theme/universe";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import styles from "./browse.module.css";

/** Sorts offered, in the words of the address (?sort=). */
export const sorts = {
  added: { sort: ItemSort.ADDED, label: "browse.sort.added" },
  title: { sort: ItemSort.TITLE, label: "browse.sort.title" },
  released: { sort: ItemSort.RELEASED, label: "browse.sort.released" },
  rating: { sort: ItemSort.RATING, label: "browse.sort.rating" },
} as const;
export type SortKey = keyof typeof sorts;

/** Address parameters shared by the lists: library, sort, genre, filters. */
export interface BrowseSearch {
  library?: string;
  sort?: SortKey;
  reverse?: boolean;
  genre?: string;
  unwatched?: boolean;
  favorites?: boolean;
}

export function validateBrowseSearch(search: Record<string, unknown>): BrowseSearch {
  const flag = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";
  return {
    library: typeof search.library === "string" ? search.library : undefined,
    sort: typeof search.sort === "string" && search.sort in sorts ? (search.sort as SortKey) : undefined,
    reverse: flag(search.reverse) || undefined,
    genre: typeof search.genre === "string" && search.genre ? search.genre : undefined,
    unwatched: flag(search.unwatched) || undefined,
    favorites: flag(search.favorites) || undefined,
  };
}

export interface BrowseProps {
  universe: Universe;
  title: string;
  subtitle: string;
  /** Tabs under the title (Albums, Artists, Tracks). */
  tabs?: ReactNode;
  /** Between the header and the list ("Continue reading"). */
  intro?: ReactNode;
  /** Panel on the right of the list (details of the chosen book). */
  aside?: ReactNode;
  /** Label of the "not watched yet" filter ("Not read yet"). */
  unwatchedLabel?: string;
  /** Sorts offered; all by default. */
  sortKeys?: readonly SortKey[];
  libraries: { id: string; name: string }[];
  genres: { name: string; count: number }[];
  search: BrowseSearch;
  setSearch: (patch: Partial<BrowseSearch>) => void;
  /** "Not watched yet" filter, if the list allows it. */
  unwatchedFilter: boolean;
  total: number;
  shown: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  children: ReactNode;
}

/** Layout of a catalog list: colored header, filters, grid, more. */
export function Browse(p: BrowseProps) {
  const { t } = useTranslation();
  const s = p.search;
  return (
    <div className={styles.page} data-ui="browse">
      <section
        className={styles.head}
        style={universeBlock(p.universe)}
        data-ui="page-header"
        data-universe={p.universe}
      >
        <div>
          <h1 className={styles.title}>{p.title}</h1>
          {/* The count changes with the filters: announced to screen readers. */}
          <p className={styles.subtitle} role="status">
            {p.subtitle}
          </p>
          {p.tabs}
        </div>
        {p.libraries.length > 1 && (
          <fieldset className={styles.libraries}>
            <legend className="sr-only">{t("browse.library")}</legend>
            {[{ id: "", name: t("browse.all") }, ...p.libraries].map((l) => {
              const on = (s.library ?? "") === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  className={styles.library}
                  data-ui="chip"
                  aria-pressed={on}
                  onClick={() => p.setSearch({ library: l.id || undefined, genre: undefined })}
                >
                  {l.name}
                </button>
              );
            })}
          </fieldset>
        )}
      </section>

      {p.intro}

      <div className={p.aside ? styles.withAside : styles.list}>
        <div className={styles.list}>
          <section className={styles.tools} aria-label={t("browse.tools")} data-ui="filters">
            <div className={styles.toolbar}>
              <label className={styles.sort}>
                <span className={styles.sortLabel}>{t("browse.sortLabel")}</span>
                <select
                  value={s.sort ?? "added"}
                  onChange={(e) =>
                    p.setSearch({
                      sort: e.target.value === "added" ? undefined : (e.target.value as SortKey),
                    })
                  }
                >
                  {(p.sortKeys ?? (Object.keys(sorts) as SortKey[])).map((k) => (
                    <option key={k} value={k}>
                      {t(sorts[k].label)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.icon}
                aria-label={t("browse.reverse")}
                aria-pressed={Boolean(s.reverse)}
                onClick={() => p.setSearch({ reverse: s.reverse ? undefined : true })}
              >
                <Icon name="sort" />
              </button>
              <span className={styles.spacer} />
              {p.unwatchedFilter && (
                <button
                  type="button"
                  className={styles.toggle}
                  aria-pressed={Boolean(s.unwatched)}
                  onClick={() => p.setSearch({ unwatched: s.unwatched ? undefined : true })}
                >
                  {p.unwatchedLabel ?? t("browse.unwatched")}
                </button>
              )}
              <button
                type="button"
                className={styles.toggle}
                aria-pressed={Boolean(s.favorites)}
                onClick={() => p.setSearch({ favorites: s.favorites ? undefined : true })}
              >
                <Icon name="heart" size={15} filled={Boolean(s.favorites)} />
                {t("browse.favorites")}
              </button>
            </div>
            {p.genres.length > 0 && (
              <fieldset className={styles.genres}>
                <legend className="sr-only">{t("browse.genre")}</legend>
                {p.genres.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    className={styles.genre}
                    data-ui="chip"
                    aria-pressed={s.genre === g.name}
                    onClick={() => p.setSearch({ genre: s.genre === g.name ? undefined : g.name })}
                  >
                    {g.name}
                    <span className={styles.count}>{g.count}</span>
                  </button>
                ))}
              </fieldset>
            )}
          </section>

          {p.total === 0 && !p.loadingMore ? <p className={styles.empty}>{t("browse.empty")}</p> : p.children}

          {p.total > 0 && (
            <div className={styles.more} data-ui="load-more">
              <span>{t("browse.shown", { shown: p.shown, total: p.total })}</span>
              {p.hasMore && (
                <Button onClick={p.loadMore} disabled={p.loadingMore}>
                  {p.loadingMore ? t("browse.loading") : t("common.seeMore")}
                </Button>
              )}
            </div>
          )}
        </div>
        {p.aside}
      </div>
    </div>
  );
}

/** Grid of posters. */
export function PosterGrid({ children }: { children: ReactNode }) {
  return (
    <ul className={styles.grid} data-ui="grid">
      {children}
    </ul>
  );
}
