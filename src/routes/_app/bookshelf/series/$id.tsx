import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../../api/errors";
import { ImageKind, pickImage } from "../../../../api/media";
import { bookState, bookToContinue, volume } from "../../../../books/logic";
import { BookPanel } from "../../../../features/books/BookPanel";
import styles from "../../../../features/books/books.module.css";
import { BookCard } from "../../../../features/books/cards";
import { FavoriteButton, MarkAllButton } from "../../../../features/catalog/actions";
import { BookService } from "../../../../gen/laterna/v1/book_pb";
import { Alert } from "../../../../ui/Alert";
import { Artwork } from "../../../../ui/Artwork";
import { Icon } from "../../../../ui/Icon";

export const Route = createFileRoute("/_app/bookshelf/series/$id")({
  validateSearch: (search: Record<string, unknown>): { book?: string } =>
    typeof search.book === "string" && search.book ? { book: search.book } : {},
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      createQueryOptions(BookService.method.getBookSeries, { seriesId: params.id }, context),
    ),
  component: SeriesPage,
});

function SeriesPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { book } = Route.useSearch();
  const query = useQuery(BookService.method.getBookSeries, { seriesId: id });
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const s = query.data?.series;
  if (!s) return null;
  const books = query.data?.books ?? [];
  const states = books.map(bookState);
  const count = (st: string) => states.filter((x) => x === st).length;
  const resume = bookToContinue(books);
  const resumeState = resume ? bookState(resume) : "unread";
  const chosen = book ?? resume?.id;

  return (
    <div className={styles.page}>
      <section className={styles.hero} data-ui="page-header" data-universe="books">
        <div className={styles.stack} aria-hidden="true">
          {books.slice(0, 3).map((b) => (
            <Artwork
              key={b.id}
              image={pickImage(b.images, ImageKind.POSTER)}
              sizes="170px"
              ratio={2 / 3}
              universe="books"
              fallback={b.title}
              shape="cover"
            />
          ))}
        </div>
        <div className={styles.heroInfo}>
          <Link to="/bookshelf" search={{ view: "series" }} className={styles.back}>
            ← {t("nav.books")}
          </Link>
          <span className={styles.kicker}>{t("books.seriesKicker", { count: books.length })}</span>
          <h1 className={styles.heroTitle}>{s.title}</h1>
          <p className={styles.kicker}>
            {[
              count("read") && t("books.readCount", { count: count("read") }),
              count("reading") && t("books.readingCount", { n: count("reading") }),
              count("unread") && t("books.unreadCount", { n: count("unread") }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className={styles.segments} aria-hidden="true">
            {books.map((b, i) => (
              <span key={b.id} data-state={states[i]} />
            ))}
          </div>
          <div className={styles.heroActions}>
            {resume && (
              <Link to="/play/book/$id" params={{ id: resume.id }} className={styles.continueButton}>
                <Icon name="play" size={14} />
                {resumeState === "reading"
                  ? t("books.resume")
                  : resumeState === "read"
                    ? t("books.reread")
                    : t("books.start")}
                {resume.number
                  ? ` · ${t("counts.volume", { n: volume(resume.number) })}`
                  : ` · ${resume.title}`}
                {resumeState === "reading" && resume.progress?.page
                  ? t("books.atPage", { page: resume.progress.page + 1 })
                  : ""}
              </Link>
            )}
            <MarkAllButton itemId={s.id} played={Boolean(s.userData?.played)} word="read" />
            <FavoriteButton itemId={s.id} favorite={Boolean(s.userData?.favorite)} />
          </div>
        </div>
      </section>

      <div className={styles.withPanel}>
        <section className={styles.page} aria-labelledby="volumes">
          <div className={styles.sectionHead}>
            <h2 id="volumes" className={styles.sectionTitle}>
              {t("books.volumes")}
            </h2>
            <span className={styles.small}>{t("books.seriesOrder")}</span>
          </div>
          <ul className={styles.grid}>
            {books.map((b) => (
              <li key={b.id}>
                <BookCard
                  book={b}
                  number
                  selected={b.id === chosen}
                  meta={
                    b.number ? t("books.volumeTitle", { n: volume(b.number) }) : b.year ? String(b.year) : ""
                  }
                  link={{ to: "/bookshelf/series/$id", params: { id }, search: { book: b.id } }}
                />
              </li>
            ))}
          </ul>
        </section>
        {chosen && <BookPanel key={chosen} bookId={chosen} />}
      </div>
    </div>
  );
}
