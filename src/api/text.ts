// Texts composed by the server (server: docs/design/i18n.md): a key, parameters, sometimes a list
// of other texts, and the text the server wrote itself in the language of the request. Here the key
// is translated with the server's catalogs into the interface language (src/i18n/server); a key
// unknown to that language keeps the server's text. Rendered like the server does: {name},
// {seconds:duration}, {bytes:bytes}, {seconds:clock}, {flag:onoff}, {list}.
import type { Text } from "../gen/laterna/v1/text_pb";
import { serverTemplate } from "../i18n";

/** The text in the interface language; empty if there is none. */
export function serverText(t: Text | undefined): string {
  if (!t) return "";
  const template = serverTemplate(t.key);
  return template === undefined ? t.text : render(template, t.params, t.list);
}

/** A server text given by its key and parameters (error code); undefined if the language does not have it. */
export function renderKey(
  key: string,
  params: Record<string, string>,
  list: readonly Text[] = [],
): string | undefined {
  const template = serverTemplate(key);
  return template === undefined ? undefined : render(template, params, list);
}

function render(template: string, params: Record<string, string>, list: readonly Text[]): string {
  return template.replace(/\{([a-z0-9_]+)(?::([a-z]+))?\}/g, (_, name: string, format?: string) =>
    name === "list"
      ? list.map(serverText).join(serverTemplate("list.separator") ?? ", ")
      : formatParam(params[name] ?? "", format),
  );
}

const word = (key: string) => serverTemplate(key) ?? "";
const unit = (n: number, name: string) => `${n} ${word(`unit.${name}`)}`;

function formatParam(value: string, format: string | undefined): string {
  if (format === "onoff") return word(value === "true" ? "word.on" : "word.off");
  const n = Number(value);
  if (!format || !/^-?\d+$/.test(value)) return value;
  switch (format) {
    case "duration":
      // The largest unit that divides evenly; otherwise minutes, rounded up.
      if (n >= 86400 && n % 86400 === 0) return unit(n / 86400, "day");
      if (n >= 3600 && n % 3600 === 0) return unit(n / 3600, "hour");
      if (n >= 60) return unit(Math.ceil(n / 60), "minute");
      return unit(n, "second");
    case "bytes":
      if (n >= 2 ** 30 && n % 2 ** 30 === 0) return unit(n / 2 ** 30, "gib");
      if (n >= 2 ** 20) return unit(Math.round(n / 2 ** 20), "mib");
      if (n >= 2 ** 10) return unit(Math.round(n / 2 ** 10), "kib");
      return unit(n, "byte");
    case "clock": {
      const two = (x: number) => String(x).padStart(2, "0");
      return n >= 3600
        ? `${Math.floor(n / 3600)}:${two(Math.floor(n / 60) % 60)}:${two(n % 60)}`
        : `${Math.floor(n / 60)}:${two(n % 60)}`;
    }
    default:
      return value;
  }
}

/**
 * Name of an item: translated if the server made it up (its x_text twin: "Season 1", "Unknown
 * artist"), otherwise as is.
 */
export function named(name: string, text?: Text): string {
  return serverText(text) || name;
}
