import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { named } from "../../../../api/text";
import { formatName, volume } from "../../../../books/logic";
import { PageReader } from "../../../../books/PageReader";
import { authors } from "../../../../features/books/BookPanel";
import { BookService } from "../../../../gen/laterna/v1/book_pb";
import { BookLayout } from "../../../../gen/laterna/v1/catalog_pb";
import { Alert } from "../../../../ui/Alert";

// foliate-js is only loaded for an EPUB.
const EpubReader = lazy(() =>
  import("../../../../books/EpubReader").then((m) => ({ default: m.EpubReader })),
);

export const Route = createFileRoute("/_app/play/book/$id")({
  validateSearch: (search: Record<string, unknown>): { file?: string } =>
    typeof search.file === "string" && search.file ? { file: search.file } : {},
  loaderDeps: ({ search }) => ({ file: search.file ?? "" }),
  // Always refetched: the position may have changed on another device.
  loader: ({ context, params, deps }) =>
    Promise.all([
      context.queryClient.fetchQuery({
        ...createQueryOptions(BookService.method.openBook, { bookId: params.id, fileId: deps.file }, context),
        staleTime: 0,
      }),
      context.queryClient.ensureQueryData(
        createQueryOptions(BookService.method.getBook, { bookId: params.id }, context),
      ),
    ]),
  gcTime: 0,
  component: ReadBook,
});

function ReadBook() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const [opened, details] = Route.useLoaderData();
  const book = details.book;
  const series = useQuery(
    BookService.method.getBookSeries,
    { seriesId: book?.seriesId ?? "" },
    { enabled: Boolean(book?.seriesId) },
  );
  if (!book || !opened.file) return <Alert>{t("books.noFile")}</Alert>;
  const list = series.data?.books ?? [];
  const after = list[list.findIndex((b) => b.id === id) + 1];
  // "Hokusai Manga, volume 5" already names its series.
  const bookTitle = named(book.title, book.titleText);
  const title =
    book.seriesTitle && !bookTitle.startsWith(book.seriesTitle)
      ? `${book.seriesTitle} · ${bookTitle}`
      : bookTitle;
  const back = book.seriesId
    ? { to: "/bookshelf/series/$id" as const, params: { id: book.seriesId }, search: { book: id } }
    : { to: "/bookshelf" as const, search: { book: id } };
  const next =
    after && list.findIndex((b) => b.id === id) >= 0
      ? {
          title: after.number ? t("books.volumeTitle", { n: volume(after.number) }) : after.title,
          link: { to: "/play/book/$id" as const, params: { id: after.id } },
        }
      : undefined;
  const by = authors(book.credits);

  if (opened.file.layout === BookLayout.REFLOWABLE)
    return (
      <Suspense fallback={null}>
        <EpubReader
          key={id}
          bookId={id}
          title={title}
          subtitle={by}
          fileUrl={opened.fileUrl}
          progress={opened.progress}
          back={back}
          next={next}
        />
      </Suspense>
    );
  const pages = opened.file.pageCount || opened.pages.length;
  return (
    <PageReader
      key={id}
      bookId={id}
      title={title}
      subtitle={[by, formatName(opened.file.format), pages ? t("books.pages", { n: pages }) : ""]
        .filter(Boolean)
        .join(" · ")}
      rightToLeft={opened.file.rightToLeft}
      source={
        opened.file.layout === BookLayout.IMAGES
          ? { kind: "images", sizes: opened.pages, prefix: opened.pageUrlPrefix }
          : { kind: "pdf", fileUrl: opened.fileUrl }
      }
      progress={opened.progress}
      back={back}
      next={next}
    />
  );
}
