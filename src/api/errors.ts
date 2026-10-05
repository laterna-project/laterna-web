import { Code, ConnectError } from "@connectrpc/connect";
import { ErrorDetailSchema } from "../gen/laterna/v1/text_pb";
import i18n, { serverTemplate } from "../i18n";
import { renderKey } from "./text";

/**
 * Message to show for a failed call. An expected error carries a stable code and its parameters
 * (ErrorDetail, server: docs/design/i18n.md), translated here into the interface language;
 * otherwise the server's message, already written for the user (capitalized here). Anything else
 * gets a generic message.
 */
export function errorMessage(err: unknown): string {
  const e = ConnectError.from(err);
  const detail = e.findDetails(ErrorDetailSchema)[0];
  if (detail && detail.code !== "server.internal") {
    const text = renderKey(`error.${detail.code}`, detail.params, detail.causes);
    if (text) return sentence(text);
  }
  switch (e.code) {
    case Code.Unavailable:
    case Code.Unknown:
      return e.rawMessage && !/fetch|network/i.test(e.rawMessage)
        ? sentence(e.rawMessage)
        : i18n.t("errors.unreachable");
    case Code.Internal:
      return i18n.t("errors.internal");
    default:
      return e.rawMessage ? sentence(e.rawMessage) : i18n.t("errors.unexpected");
  }
}

/**
 * Message of a route outside Connect (file, image): its code is in the Laterna-Error header and its
 * body is the server's text. A message that needs parameters, which the header does not carry,
 * keeps that text.
 */
export function httpErrorMessage(code: string | null, body: string): string | undefined {
  // Without the header, the response does not come from the server (proxy, network).
  if (!code) return undefined;
  const template = code !== "server.internal" ? serverTemplate(`error.${code}`) : undefined;
  if (template && !template.includes("{")) return sentence(template);
  return body.trim() ? sentence(body.trim()) : undefined;
}

const sentence = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);
