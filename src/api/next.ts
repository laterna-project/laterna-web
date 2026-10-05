/**
 * Page to return to after login ("?next=/device?code=..."): a path of the app only, never another
 * address ("//example.com", "https://...").
 */
export function safeNext(path: unknown): string | undefined {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : undefined;
}

/**
 * Device code as typed ("bdwp hqpk", "BDWPHQPK") formatted as the device shows it: "BDWP-HQPK". The
 * server accepts both; only the letters count.
 */
export function formatUserCode(input: string): string {
  const letters = input
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 8);
  return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
}
