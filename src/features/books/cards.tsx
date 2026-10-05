import { Link, type LinkProps } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ImageKind, pickImage } from "../../api/media";
import { named } from "../../api/text";
import { bookState, volume } from "../../books/logic";
import type { BookSeries, BookSummary } from "../../gen/laterna/v1/catalog_pb";
import i18n from "../../i18n";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import styles from "./books.module.css";

export function bookMeta(b: BookSummary): string {
  if (b.seriesTitle)
    return `${b.seriesTitle}${b.number ? ` · ${i18n.t("counts.volume", { n: volume(b.number) })}` : ""}`;
  return b.year ? String(b.year) : "";
}

/** Cover and its badges: read, favorite, progress. */
export function Cover({ book: b, sizes, number }: { book: BookSummary; sizes: string; number?: boolean }) {
  const { t } = useTranslation();
  const state = bookState(b);
  return (
    <span className={styles.cover}>
      <Artwork
        image={pickImage(b.images, ImageKind.POSTER)}
        sizes={sizes}
        ratio={2 / 3}
        universe="books"
        fallback={named(b.title, b.titleText)}
        shape="cover"
      />
      {number && b.number > 0 && <span className={styles.number}>{volume(b.number)}</span>}
      {state === "read" && (
        <span className={styles.readBadge} data-ui="badge">
          <Icon name="check" size={11} />
          {t("books.read")}
        </span>
      )}
      {b.userData?.favorite && (
        <span className={styles.favorite} role="img" aria-label={t("catalog.favorite")} data-ui="badge">
          <Icon name="heart" size={12} filled />
        </span>
      )}
      {state === "reading" && (
        <span className={styles.progress} aria-hidden="true" data-ui="progress">
          <span style={{ width: `${(b.progress?.progression ?? 0) * 100}%` }} />
        </span>
      )}
    </span>
  );
}

/** Book in a list: a click shows it in the page's panel. */
export function BookCard({
  book: b,
  link,
  selected,
  meta = bookMeta(b),
  number,
}: {
  book: BookSummary;
  link: LinkProps;
  selected: boolean;
  meta?: string;
  number?: boolean;
}) {
  return (
    <Link
      {...link}
      className={styles.card}
      data-ui="card"
      data-kind="book"
      data-universe="books"
      aria-current={selected ? "true" : undefined}
      resetScroll={false}
      replace
    >
      <Cover book={b} sizes="(max-width: 767px) 45vw, 180px" number={number} />
      <span className={styles.title} data-ui="card-title">
        {named(b.title, b.titleText)}
      </span>
      {meta && (
        <span className={styles.meta} data-ui="card-meta">
          {meta}
        </span>
      )}
    </Link>
  );
}

export function SeriesCard({ series: s }: { series: BookSeries }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/bookshelf/series/$id"
      params={{ id: s.id }}
      className={styles.card}
      data-ui="card"
      data-kind="book-series"
      data-universe="books"
    >
      <span className={styles.cover}>
        <Artwork
          image={pickImage(s.images, ImageKind.POSTER)}
          sizes="(max-width: 767px) 45vw, 180px"
          ratio={2 / 3}
          universe="books"
          fallback={s.title}
          shape="cover"
        />
        {s.userData?.played && (
          <span className={styles.readBadge} data-ui="badge">
            <Icon name="check" size={11} />
            {t("books.seriesRead")}
          </span>
        )}
      </span>
      <span className={styles.title} data-ui="card-title">
        {s.title}
      </span>
      <span className={styles.meta} data-ui="card-meta">
        {t("counts.books", { count: s.bookCount })}
      </span>
    </Link>
  );
}
