import { createQueryOptions, useTransport } from "@connectrpc/connect-query";
import { useQueries } from "@tanstack/react-query";
import { CatalogService } from "../../gen/laterna/v1/catalog_pb";

/**
 * Genres of the given libraries, counts added up, most frequent first. Each library is read on its
 * own: without a library, the server would mix in the genres of music.
 */
export function useGenres(libraryIds: readonly string[]): { name: string; count: number }[] {
  const transport = useTransport();
  const results = useQueries({
    queries: libraryIds.map((libraryId) =>
      createQueryOptions(CatalogService.method.listGenres, { libraryId }, { transport }),
    ),
  });
  const counts = new Map<string, number>();
  for (const r of results)
    for (const g of r.data?.genres ?? []) counts.set(g.name, (counts.get(g.name) ?? 0) + g.count);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
}
