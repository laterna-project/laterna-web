import { createFileRoute } from "@tanstack/react-router";
import { validateViewerSearch } from "../../../../photos/context";
import { PhotoViewer } from "../../../../photos/Viewer";

export const Route = createFileRoute("/_app/play/photo/$id")({
  validateSearch: validateViewerSearch,
  component: ViewPhoto,
});

function ViewPhoto() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return <PhotoViewer id={id} search={search} />;
}
