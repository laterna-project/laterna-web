// Passkeys (server: docs/design/accounts.md): the server gives the options in the WebAuthn level 3
// JSON format, passed as is to the browser, and receives its response as JSON (toJSON()).
import i18n from "../i18n";

/** Whether the browser can create and present a passkey from the server's JSON options. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential?.parseCreationOptionsFromJSON === "function" &&
    typeof window.PublicKeyCredential?.parseRequestOptionsFromJSON === "function"
  );
}

/** Creates a passkey on this device; returns the authenticator's response as JSON. */
export async function createPasskey(optionsJson: string): Promise<string> {
  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(JSON.parse(optionsJson));
  const credential = await navigator.credentials.create({ publicKey });
  if (!(credential instanceof PublicKeyCredential)) throw new Error(i18n.t("errors.passkeyNotCreated"));
  return JSON.stringify(credential.toJSON());
}

/** Asks for a passkey (the browser offers the ones for this site); returns its response as JSON. */
export async function getPasskey(optionsJson: string): Promise<string> {
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(JSON.parse(optionsJson));
  const credential = await navigator.credentials.get({ publicKey });
  if (!(credential instanceof PublicKeyCredential)) throw new Error(i18n.t("errors.passkeyNotGiven"));
  return JSON.stringify(credential.toJSON());
}

/**
 * Message for a refusal by the browser: cancelled by the person (or timed out), passkey already on
 * this device, or a site the server does not expect. undefined for other errors.
 */
export function passkeyError(err: unknown): string | undefined {
  if (!(err instanceof DOMException)) return undefined;
  switch (err.name) {
    case "NotAllowedError":
    case "AbortError":
      return i18n.t("errors.passkeyCancelled");
    case "InvalidStateError":
      return i18n.t("errors.passkeyExists");
    case "SecurityError":
      return i18n.t("errors.passkeyOrigin");
    default:
      return err.message || undefined;
  }
}
