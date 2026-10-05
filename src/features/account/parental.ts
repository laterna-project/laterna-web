import type { ParentalControl, Profile } from "../../gen/laterna/v1/profile_pb";
import i18n from "../../i18n";

/** Ages offered (ratings converted to an age by the server); null: no limit. */
export const ages: readonly (number | null)[] = [null, 16, 12, 10, 6, 0];

/** Name of an age offered: "No limit", "16", "All ages". */
export function ageChoice(value: number | null): string {
  if (value === null) return i18n.t("parental.noLimit");
  return value === 0 ? i18n.t("parental.allAges") : i18n.t("parental.years", { count: value });
}

/** "16", "all ages"; empty without an age limit. */
export function ageLabel(maxAge: number | undefined): string {
  if (maxAge === undefined) return "";
  return maxAge === 0 ? i18n.t("parental.allAgesShort") : i18n.t("parental.yearsShort", { count: maxAge });
}

/** Parental controls in effect (maximum age, or unrated content hidden). */
export function parentalActive(parental: ParentalControl | undefined): boolean {
  return parental?.maxAge !== undefined || Boolean(parental?.blockUnrated);
}

/**
 * Restricted profile (kid, or under parental controls): the server does not allow administration
 * from it, even on an administrator's account.
 */
export function restricted(profile: Profile): boolean {
  return profile.kid || parentalActive(profile.parental);
}
