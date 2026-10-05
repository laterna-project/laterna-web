import { useQuery } from "@connectrpc/connect-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { ImageKind, pickImage } from "../../api/media";
import { named } from "../../api/text";
import { formatName, layoutLabel, percent, volume } from "../../books/logic";
import { BookService } from "../../gen/laterna/v1/book_pb";
import { type Credit, CreditRole } from "../../gen/laterna/v1/catalog_pb";
import { Alert } from "../../ui/Alert";
import { Artwork } from "../../ui/Artwork";
import { Icon } from "../../ui/Icon";
import { FavoriteButton, PlayedButton } from "../catalog/actions";
import { fileSize, languageName, longDate, relativeDay } from "../catalog/format";
import styles from "./books.module.css";

/** Authors, then artists. */
export function authors(credits: readonly Credit[]): string {
  const names = (role: CreditRole) => credits.filter((c) => c.role === role).map((c) => c.name);
  return [...new Set([...names(CreditRole.WRITER), ...names(CreditRole.ILLUSTRATOR)])].join(", ");
}

/** Details of the chosen book, next to a list. */
export function BookPanel({ bookId }: { bookId: string }) {
  const { t } = useTranslation();
  const query = useQuery(BookService.method.getBook, { bookId });
  const [fileId, setFileId] = useState<string | null>(null);
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  const b = query.data?.book;
  if (!b) return <aside className={styles.panel} aria-busy="true" data-ui="side-panel" />;
  const files = query.data?.files ?? [];
  const chosen = files.find((f) => f.id === fileId) ?? files[0];
  const progression = b.progress?.progression ?? 0;
  const started = !b.userData?.played && progression > 0;
  const by = authors(b.credits);
  const facts = [
    [t("books.facts.publisher"), b.publisher],
    [t("books.facts.published"), b.premiereDate ? longDate(b.premiereDate) : b.year ? String(b.year) : ""],
    [t("books.facts.language"), b.language ? languageName(b.language) : ""],
    [t("books.facts.pages"), chosen?.book?.pageCount ? String(chosen.book.pageCount) : ""],
    [t("books.facts.isbn"), b.isbn],
  ].filter(([, v]) => v);

  return (
    <aside className={styles.panel} aria-label={t("books.bookOf", { title: b.title })} data-ui="side-panel">
      <div className={styles.panelTop}>
        <Artwork
          image={pickImage(b.images, ImageKind.POSTER)}
          sizes="120px"
          ratio={2 / 3}
          universe="books"
          fallback={named(b.title, b.titleText)}
          shape="cover"
          className={styles.panelCover}
        />
        <span className={styles.panelInfo}>
          <span className={styles.chips}>
            {b.genres[0] && <span className={styles.chip}>{b.genres[0]}</span>}
            {chosen?.book && <span className={styles.chipStrong}>{formatName(chosen.book.format)}</span>}
          </span>
          <span className={styles.panelTitle}>{named(b.title, b.titleText)}</span>
          <span className={styles.meta}>{[by, b.year || null].filter(Boolean).join(" · ")}</span>
          {b.seriesId && (
            <Link to="/bookshelf/series/$id" params={{ id: b.seriesId }} className={styles.seriesLink}>
              {b.seriesTitle}
              {b.number ? ` · ${t("counts.volume", { n: volume(b.number) })}` : ""}
            </Link>
          )}
        </span>
      </div>
      {b.overview && <p className={styles.overview}>{b.overview.split(/\n\s*\n/)[0]}</p>}
      {started && (
        <>
          <span className={styles.bar}>
            <span style={{ width: `${progression * 100}%` }} />
          </span>
          <p className={styles.small}>
            {percent(progression)}
            {b.progress?.updatedAt
              ? ` · ${t("books.readWhen", { when: relativeDay(new Date(Number(b.progress.updatedAt.seconds) * 1000)) })}`
              : ""}
          </p>
        </>
      )}
      <Link
        to="/play/book/$id"
        params={{ id: b.id }}
        search={chosen && files.length > 1 ? { file: chosen.id } : {}}
        className={styles.readButton}
        data-big="true"
      >
        <Icon name="play" size={14} />
        {started
          ? t("books.continueReading")
          : b.userData?.played
            ? t("books.reread")
            : t("books.readButton")}
      </Link>
      <div className={styles.actions} data-ui="actions">
        <PlayedButton itemId={b.id} played={Boolean(b.userData?.played)} label={t("books.read")} />
        <FavoriteButton itemId={b.id} favorite={Boolean(b.userData?.favorite)} />
      </div>
      {files.length > 1 && (
        <fieldset className={styles.formats}>
          <legend className={styles.label}>{t("books.readAs")}</legend>
          {files.map((f) => (
            <label key={f.id} className={styles.format}>
              <input
                type="radio"
                name="format"
                checked={f.id === chosen?.id}
                onChange={() => setFileId(f.id)}
                className="sr-only"
              />
              <span className={styles.formatName}>{f.book ? formatName(f.book.format) : f.version}</span>
              <span className={styles.formatHow}>{f.book ? layoutLabel(f.book.layout) : ""}</span>
              <span className={styles.formatSize}>{fileSize(f.size)}</span>
            </label>
          ))}
        </fieldset>
      )}
      {facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
