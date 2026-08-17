import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

export const LOCALE_COOKIE = "portal_locale";

/**
 * Resolution order: explicit cookie (set by the language switcher) wins,
 * otherwise DEFAULT_LOCALE. Deliberately does NOT fall back to a signed-in
 * passenger's passengers.preferred_language here — that would mean a
 * passenger who set a language preference on their profile some other way
 * silently overrides a locale they just picked from the switcher on THIS
 * visit. The signup/profile forms instead write the cookie themselves
 * whenever preferred_language changes, keeping one source of truth for
 * "what language is this page in right now."
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  return isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
}
