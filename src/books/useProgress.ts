import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { postKeepalive } from "../api/keepalive";
import { BookService } from "../gen/laterna/v1/book_pb";

export interface Position {
  page?: number;
  locator?: string;
  progression: number;
}

/**
 * Saves where the reader is: batched (a second and a half after the last change), sent when
 * leaving, and with a keepalive request when the tab closes.
 */
export function useProgress(bookId: string): (p: Position) => void {
  const transport = useTransport();
  const books = useMemo(() => createClient(BookService, transport), [transport]);
  const pending = useRef<Position | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p)
      void books
        .saveReadingProgress({
          bookId,
          page: p.page ?? 0,
          locator: p.locator ?? "",
          progression: p.progression,
        })
        .catch(() => {});
  }, [bookId, books]);

  useEffect(() => {
    const onHide = () => {
      const p = pending.current;
      pending.current = null;
      if (p)
        postKeepalive("/laterna.v1.BookService/SaveReadingProgress", {
          bookId,
          page: p.page ?? 0,
          locator: p.locator ?? "",
          progression: p.progression,
        });
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [bookId, flush]);

  return useCallback(
    (p: Position) => {
      pending.current = p;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1500);
    },
    [flush],
  );
}
