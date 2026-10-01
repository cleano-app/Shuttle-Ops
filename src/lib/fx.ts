import "server-only";

export interface FxRates {
  /** ECB publication date, "YYYY-MM-DD". */
  date: string;
  /** Units of each currency per 1 EUR (EUR itself = 1). */
  perEur: Record<string, number>;
}

/**
 * European Central Bank reference rates via frankfurter.app (free, no key),
 * cached for an hour. For the dashboard converter only — fares, deposits
 * and reports never use these (spec §34: fixed dual pricing, no live FX).
 */
export async function getFxRates(): Promise<FxRates | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR", { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { date: string; rates: Record<string, number> };
    return { date: json.date, perEur: { EUR: 1, ...json.rates } };
  } catch {
    return null;
  }
}
