// Client-side "possible duplicate" hint for the address creation form (build
// spec §16). The primary fuzzy-match/ranking work happens server-side via
// Postgres's pg_trgm (search_addresses(), 0004_addresses.sql) — this is a
// small, dependency-free trigram similarity re-implementation used only to
// flag the *top* search result as a likely duplicate above a higher bar
// than the search threshold itself (0.15), so "possible match" only fires
// when it's genuinely close, not for every loose text match.

function trigrams(input: string): Set<string> {
  const s = `  ${input.toLowerCase().trim()}  `;
  const grams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) {
    grams.add(s.slice(i, i + 3));
  }
  return grams;
}

/** 0..1 similarity, same rough shape as Postgres's pg_trgm similarity(). */
export function trigramSimilarity(a: string, b: string): number {
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const g of setA) {
    if (setB.has(g)) shared += 1;
  }
  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Threshold above which the create-address form warns "this looks like an
 * existing address" rather than just ranking it in the autocomplete list. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

export function isLikelyDuplicate(
  candidate: { line1: string; postcode: string },
  existing: { line1: string; postcode: string }
): boolean {
  const key = (a: { line1: string; postcode: string }) => `${a.line1} ${a.postcode}`;
  return trigramSimilarity(key(candidate), key(existing)) > DUPLICATE_SIMILARITY_THRESHOLD;
}
