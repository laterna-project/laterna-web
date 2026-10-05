// Reader settings, kept on the device.
import type { PageMode } from "./logic";

export type Paper = "paper" | "sepia" | "night";
export type ReadingFont = "literary" | "sans" | "legible";

export interface TextSettings {
  /** Text size in pixels. */
  size: number;
  font: ReadingFont;
  paper: Paper;
  /** Two columns side by side when the screen allows it. */
  spread: boolean;
  /** Wide line spacing. */
  airy: boolean;
}

export interface PageSettings {
  mode: PageMode;
  /** Page fit to the screen's height, or to its width. */
  fit: "height" | "width";
}

export const textDefaults: TextSettings = {
  size: 20,
  font: "literary",
  paper: "paper",
  spread: false,
  airy: true,
};
export const pageDefaults: PageSettings = { mode: "double", fit: "height" };
export const textSizes = { min: 14, max: 32 };

export const papers = [
  { id: "paper", label: "books.papers.paper" },
  { id: "sepia", label: "books.papers.sepia" },
  { id: "night", label: "books.papers.night" },
] as const satisfies readonly { id: Paper; label: string }[];

export const fonts = [
  { id: "literary", label: "books.fonts.literary", token: "--font-reading" },
  { id: "sans", label: "books.fonts.sans", token: "--font-sans" },
  { id: "legible", label: "books.fonts.legible", token: "--font-legible" },
] as const satisfies readonly { id: ReadingFont; label: string; token: string }[];

function load<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<T>) } : defaults;
  } catch {
    return defaults;
  }
}

function save(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Settings kept for this reading only.
  }
}

/**
 * Default background when none was chosen: the one that matches the theme, night for a dark theme
 * ("--color-scheme: dark", the lantern of "Magic lantern"), paper otherwise.
 */
export function defaultPaper(scheme: string): Paper {
  return scheme.trim() === "dark" ? "night" : "paper";
}

export const loadText = () =>
  load("laterna.reader.text", {
    ...textDefaults,
    paper: defaultPaper(getComputedStyle(document.documentElement).getPropertyValue("--color-scheme")),
  });
export const saveText = (s: TextSettings) => save("laterna.reader.text", s);
export const loadPages = () => load("laterna.reader.pages", pageDefaults);
export const savePages = (s: PageSettings) => save("laterna.reader.pages", s);
