import { useQuery } from "@connectrpc/connect-query";
import { useEffect, useSyncExternalStore } from "react";
import { ThemeMode, ThemeService } from "../gen/laterna/v1/theme_pb";
import { applyServerTheme, serverThemeImages, subscribeServerTheme } from "./serverLayer";

/**
 * The server's theme, readable without signing in (entry screens): set by the root. Refetched when
 * the event stream announces ThemesChanged (ThemeService invalidated).
 */
export function ServerThemeSync() {
  const theme = useQuery(ThemeService.method.getServerTheme, {}, { staleTime: 60_000 }).data?.theme;
  useEffect(() => {
    if (theme) applyServerTheme("server", theme, ThemeMode.AUTO);
  }, [theme]);
  return null;
}

/** Theme of the chosen profile and its mode: set by the signed-in app, it wins. */
export function ProfileThemeSync() {
  const res = useQuery(ThemeService.method.getMyTheme, {}).data;
  useEffect(() => {
    if (res?.theme) applyServerTheme("profile", res.theme, res.mode);
  }, [res]);
  // When leaving the signed-in app (logout, profile choice), the server's theme takes over again.
  useEffect(() => () => applyServerTheme("profile", null, ThemeMode.AUTO), []);
  return null;
}

let images = serverThemeImages();
const read = () => images;
const subscribe = (onChange: () => void) =>
  subscribeServerTheme(() => {
    const next = serverThemeImages();
    if (next.logo !== images.logo || next.background !== images.background) {
      images = next;
      onChange();
    }
  });

/** Logo and background of the applied server theme, if it has them. */
export function useThemeImages() {
  return useSyncExternalStore(subscribe, read, read);
}
