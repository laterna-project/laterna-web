// Server theme set by the app (docs/design/themes.md): the server's for the entry screens, the
// profile's for the signed-in app, which wins. theme.ts builds the applied style sheet from it; the
// logo and background are read here, without loading the device's themes.
import type { Image } from "../gen/laterna/v1/catalog_pb";
import type { Theme, ThemeMode } from "../gen/laterna/v1/theme_pb";

export interface Layer {
  theme: Theme;
  mode: ThemeMode;
}

const layers: { server?: Layer; profile?: Layer } = {};
const listeners = new Set<() => void>();

/**
 * Sets the server's theme ("server", entry screens) or the profile's ("profile", signed-in app);
 * null removes the layer. The profile wins while it is set.
 */
export function applyServerTheme(layer: "server" | "profile", theme: Theme | null, mode: ThemeMode): void {
  if (theme) layers[layer] = { theme, mode };
  else delete layers[layer];
  for (const l of listeners) l();
}

/** Applied layer: the profile, otherwise the server; none before the first response. */
export function activeLayer(): Layer | undefined {
  return layers.profile ?? layers.server;
}

export function subscribeServerTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Images of the applied theme: the server's logo, the background of home and login. */
export function serverThemeImages(): { logo?: Image; background?: Image } {
  const t = activeLayer()?.theme;
  return { logo: t?.logo, background: t?.background };
}
