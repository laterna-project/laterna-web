// Interface language (docs/design/i18n.md): the official languages of the European Union that have
// a catalog, chosen per device, with i18next. English is the default, the reference catalog and the
// fallback; it is bundled, the other catalogs load on demand. Components read their texts with
// useTranslation(), code outside components with i18n.t(). Dates, numbers and lists go through Intl
// in the chosen language (locale()).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import serverEn from "./server/en.json";

/**
 * The 24 official languages of the European Union, in its protocol order (by name in the language),
 * each named in its own language, with the region used for Intl when the browser gives none.
 */
export const euLanguages = [
  { id: "bg", name: "Български", region: "BG" },
  { id: "es", name: "Español", region: "ES" },
  { id: "cs", name: "Čeština", region: "CZ" },
  { id: "da", name: "Dansk", region: "DK" },
  { id: "de", name: "Deutsch", region: "DE" },
  { id: "et", name: "Eesti", region: "EE" },
  { id: "el", name: "Ελληνικά", region: "GR" },
  { id: "en", name: "English", region: "" },
  { id: "fr", name: "Français", region: "FR" },
  { id: "ga", name: "Gaeilge", region: "IE" },
  { id: "hr", name: "Hrvatski", region: "HR" },
  { id: "it", name: "Italiano", region: "IT" },
  { id: "lv", name: "Latviešu", region: "LV" },
  { id: "lt", name: "Lietuvių", region: "LT" },
  { id: "hu", name: "Magyar", region: "HU" },
  { id: "mt", name: "Malti", region: "MT" },
  { id: "nl", name: "Nederlands", region: "NL" },
  { id: "pl", name: "Polski", region: "PL" },
  { id: "pt", name: "Português", region: "PT" },
  { id: "ro", name: "Română", region: "RO" },
  { id: "sk", name: "Slovenčina", region: "SK" },
  { id: "sl", name: "Slovenščina", region: "SI" },
  { id: "fi", name: "Suomi", region: "FI" },
  { id: "sv", name: "Svenska", region: "SE" },
] as const;

export type Language = (typeof euLanguages)[number]["id"];

// Catalogs of the other languages, each in its own build file.
const catalogs = import.meta.glob<Record<string, unknown>>(["./locales/*.json", "!./locales/en.json"], {
  import: "default",
});

/** Languages offered: those with a catalog. Adding a language means adding its file. */
export const languages = euLanguages.filter((l) => l.id === "en" || `./locales/${l.id}.json` in catalogs);

const ids: readonly string[] = languages.map((l) => l.id);
const isLanguage = (v: unknown): v is Language => typeof v === "string" && ids.includes(v);
/** "fr-CA" -> "fr". */
const base = (tag: string) => tag.toLowerCase().split(/[-_]/)[0] ?? "";

const storageKey = "laterna.language";

function stored(): Language | undefined {
  try {
    const v = globalThis.localStorage?.getItem(storageKey);
    return isLanguage(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The first language the browser asks for that is offered; undefined if it asks for none. */
export function browserLanguage(
  list: readonly string[] = globalThis.navigator?.languages ?? [],
): Language | undefined {
  return list.map(base).find(isLanguage);
}

/**
 * Language coming from somewhere other than the device: the profile's (it follows the profile from
 * one device to another), otherwise the server's before any login. Taken only if the device chose
 * nothing and, for the server's language, if the browser asks for no offered language. It is not
 * remembered on the device.
 */
export function adoptLanguage(tag: string | undefined, from: "profile" | "server"): void {
  if (stored() || (from === "server" && browserLanguage())) return;
  const lang = base(tag ?? "");
  if (isLanguage(lang) && lang !== language()) void setLanguage(lang, false);
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ids,
  // The English catalog is bundled: ready at once, with no wait and no Suspense.
  initAsync: false,
  // React already escapes what it renders.
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function language(): Language {
  return isLanguage(i18n.language) ? i18n.language : "en";
}

/**
 * BCP 47 tag for Intl and for the server: the browser's variant when it is of the same language
 * ("fr-CA", "en-GB"), otherwise the chosen region ("fr-FR"), and "en" for English.
 */
export function locale(lang: Language = language()): string {
  const fromBrowser = globalThis.navigator?.languages?.find((l) => base(l) === lang);
  if (fromBrowser) return fromBrowser;
  const region = euLanguages.find((l) => l.id === lang)?.region;
  return region ? `${lang}-${region}` : lang;
}

// Catalogs of the server's texts (server: docs/design/i18n.md): flat, in its syntax ({name},
// {seconds:duration}, {list}). English and French are copied from the server repository, the other
// languages are translated here. They load with the interface catalogs.
const serverCatalogs = import.meta.glob<Record<string, string>>(["./server/*.json", "!./server/en.json"], {
  import: "default",
});
const serverTexts = new Map<string, Record<string, string>>([["en", serverEn]]);

/** Template of a server text in the current language; undefined if the language does not have it. */
export function serverTemplate(key: string, lang: Language = language()): string | undefined {
  return serverTexts.get(lang)?.[key];
}

/** Loads a language's catalogs if they are not loaded yet. */
async function load(lang: Language): Promise<void> {
  const server = serverCatalogs[`./server/${lang}.json`];
  if (server && !serverTexts.has(lang)) serverTexts.set(lang, await server());
  if (i18n.hasResourceBundle(lang, "translation")) return;
  const loader = catalogs[`./locales/${lang}.json`];
  if (!loader) return;
  i18n.addResourceBundle(lang, "translation", await loader());
}

/** Changes the interface language (its catalog loaded first) and remembers it on this device. */
export async function setLanguage(lang: Language, remember = true): Promise<void> {
  await load(lang);
  await i18n.changeLanguage(lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  if (remember)
    try {
      localStorage.setItem(storageKey, lang);
    } catch {
      // Storage unavailable: the language lasts for this visit.
    }
}

/** The device's language is ready (its catalog loaded): awaited before the first render. */
export const ready: Promise<void> = setLanguage(stored() ?? browserLanguage() ?? "en", false).catch(() => {
  // Catalog not found (network lost while loading): the interface stays in English.
});

/** Number formatted in the current language ("1 234", "1,234"). */
export function num(n: number | bigint, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), options).format(n);
}

/** "Movies, Series and Music": a list in the current language. */
export function list(items: readonly string[], type: "conjunction" | "disjunction" = "conjunction"): string {
  return new Intl.ListFormat(locale(), { style: "long", type }).format(items);
}

export default i18n;
