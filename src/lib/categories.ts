import type { PassengerCategory } from "@/types/database";

/** Every passenger category, in the order Office picks them. "unspecified"
 * is for a caller who books the family before saying who is who (spec §33:
 * Office confirms categories later); it still takes a seat. */
export const CATEGORY_OPTIONS: { value: PassengerCategory; label: string }[] = [
  { value: "man", label: "Man" },
  { value: "woman", label: "Woman" },
  { value: "boy", label: "Boy" },
  { value: "girl", label: "Girl" },
  { value: "infant", label: "Infant" },
  { value: "unspecified", label: "Not known yet" },
];

export function categoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}

/** "7 men · 5 women · 2 boys · 1 girl · 2 infants · 1 not known yet" —
 * zero counts are left out except when everything is zero. */
export function compositionText(c: {
  men?: number | null;
  women?: number | null;
  boys?: number | null;
  girls?: number | null;
  infants?: number | null;
  unspecified?: number | null;
}): string {
  const parts = [
    [c.men, "man", "men"],
    [c.women, "woman", "women"],
    [c.boys, "boy", "boys"],
    [c.girls, "girl", "girls"],
    [c.infants, "infant", "infants"],
    [c.unspecified, "not known yet", "not known yet"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, one, many]) => `${n} ${Number(n) === 1 ? one : many}`);
  return parts.length ? parts.join(" · ") : "No passengers yet";
}
