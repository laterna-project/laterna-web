// Photos the viewer goes through: the timeline, the favorites, an album or a selection. The same
// query serves the grid and the viewer (shared cache).

export interface PhotoContext {
  album?: string;
  favorites?: boolean;
  /** Photos chosen in a grid (kept for the tab). */
  selection?: boolean;
}

export interface ViewerSearch extends PhotoContext {
  slideshow?: boolean;
}

const flag = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";

export function validateViewerSearch(search: Record<string, unknown>): ViewerSearch {
  return {
    album: typeof search.album === "string" && search.album ? search.album : undefined,
    favorites: flag(search.favorites) || undefined,
    selection: flag(search.selection) || undefined,
    slideshow: flag(search.slideshow) || undefined,
  };
}

/** ListPhotos request of a sequence (selection excluded). */
export function listInput(c: PhotoContext) {
  return {
    libraryId: "",
    albumId: c.album ?? "",
    favoritesOnly: Boolean(c.favorites),
    pageSize: 100,
    pageToken: "",
  };
}

const selectionKey = "laterna.photos.selection";

export function saveSelection(ids: readonly string[]): void {
  try {
    sessionStorage.setItem(selectionKey, JSON.stringify(ids));
  } catch {
    // Without storage, the slideshow of a selection falls back to the timeline.
  }
}

export function loadSelection(): string[] {
  try {
    const ids = JSON.parse(sessionStorage.getItem(selectionKey) ?? "[]") as unknown;
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
