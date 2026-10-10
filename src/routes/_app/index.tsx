import { createQueryOptions, useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { errorMessage } from "../../api/errors";
import { catalogLibrariesQuery } from "../../api/queries";
import { HomeSkeleton, HomeView } from "../../features/home/HomeView";
import { CatalogService } from "../../gen/laterna/v1/catalog_pb";
import { HomeService } from "../../gen/laterna/v1/home_pb";
import { Alert } from "../../ui/Alert";

/**
 * Items per row: enough to fill a scrolling strip on a large screen. "Coming soon" is asked for:
 * the server only sends it to a client that shows its entries.
 */
const home = { rowSize: 12, upcoming: true };

export const Route = createFileRoute("/_app/")({
  // Loaded before rendering; the event stream refetches it when it changes.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(createQueryOptions(HomeService.method.getHome, home, context)),
      context.queryClient.ensureQueryData(catalogLibrariesQuery(context.transport)),
    ]),
  pendingComponent: HomeSkeleton,
  component: Home,
});

function Home() {
  const { profile } = Route.useRouteContext();
  const query = useQuery(HomeService.method.getHome, home);
  const libraries = useQuery(CatalogService.method.listCatalogLibraries, {}).data?.libraries ?? [];
  if (query.isError) return <Alert>{errorMessage(query.error)}</Alert>;
  if (!query.data) return <HomeSkeleton />;
  return (
    <HomeView
      name={profile.name}
      rows={query.data.rows}
      libraryName={(id) => libraries.find((l) => l.id === id)?.name}
    />
  );
}
