import { DICTIONARIES, type Dictionary, type DictionaryKey } from "./dictionaries";
import type { Locale } from "./locales";

// Pure — unit-tested directly, no server/client dependency either way.
export function translate(locale: Locale, key: DictionaryKey, vars?: Record<string, string | number>): string {
  const dict: Dictionary = DICTIONARIES[locale] ?? DICTIONARIES.en;
  let value = dict[key] ?? DICTIONARIES.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replaceAll(`{${k}}`, String(v));
    }
  }
  return value;
}

/** Bound helper so a page/component can call t("key") without threading
 * the locale through every call — same shape as most i18n libraries'
 * useTranslations()/getTranslator() convenience wrapper. */
export function getTranslator(locale: Locale) {
  return (key: DictionaryKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
