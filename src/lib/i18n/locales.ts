// Build spec Phase 5 (§39): "multi-language UI (English/Yiddish/Hebrew/
// Dutch)." Scoped to the public passenger/referrer portal only — office
// and driver stay English-only internal tools, matching how every other
// role-specific surface in this app is scoped. Hand-rolled dictionary
// lookup rather than a library (next-intl etc.) — nothing in this
// project pulls in an i18n dependency anywhere else, and the portal's
// string set is small enough that a plain object lookup is simpler to
// audit than a library's config surface.
export const LOCALES = ["en", "yi", "he", "nl"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const RTL_LOCALES: readonly Locale[] = ["yi", "he"];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return isRtl(locale) ? "rtl" : "ltr";
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  yi: "ייִדיש",
  he: "עברית",
  nl: "Nederlands",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
