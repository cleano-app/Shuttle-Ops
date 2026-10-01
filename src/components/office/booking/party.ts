import type { Currency, PassengerCategory } from "@/types/database";
import { defaultOccupiesSeat, emptyTravellerRow, type TravellerRow } from "../types";

// The Booking Console works on the whole party (owner, 1 Oct 2026): one
// set of steppers, one pickup/drop-off, one luggage count. Underneath, the
// data stays one TravellerRow per passenger; these helpers turn party-level
// changes into row changes.

export type LuggageKind = keyof TravellerRow["luggage"];

export function countByCategory(rows: TravellerRow[]): Record<PassengerCategory, number> {
  const counts: Record<PassengerCategory, number> = { man: 0, woman: 0, boy: 0, girl: 0, infant: 0, unspecified: 0 };
  for (const r of rows) counts[r.category] = (counts[r.category] ?? 0) + 1;
  return counts;
}

function isBlank(row: TravellerRow): boolean {
  return !row.passengerId && !row.passengerName.trim();
}

/** A new row of `category` that shares the party's addresses and amounts. */
export function newPartyRow(category: PassengerCategory, currency: Currency, template?: TravellerRow): TravellerRow {
  const row = emptyTravellerRow(currency);
  row.category = category;
  row.occupiesSeat = defaultOccupiesSeat(category);
  if (template) {
    row.pickupAddressId = template.pickupAddressId;
    row.pickupLabel = template.pickupLabel;
    row.pickupSnapshot = template.pickupSnapshot;
    row.dropoffAddressId = template.dropoffAddressId;
    row.dropoffLabel = template.dropoffLabel;
    row.dropoffSnapshot = template.dropoffSnapshot;
    row.contribution = template.contribution;
    row.sponsored = template.sponsored;
    row.depositWaived = template.depositWaived;
  }
  return row;
}

/**
 * Index of the row the − button for `category` takes away, or -1 if none
 * may go. Prefers the last unnamed row of that kind; never the first row
 * (the caller) unless it is still blank and someone else is travelling.
 */
export function removableIndex(rows: TravellerRow[], category: PassengerCategory): number {
  const candidates = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => i > 0 && r.category === category);
  const blank = candidates.filter(({ r }) => isBlank(r));
  const pick = (blank.length ? blank : candidates).at(-1);
  if (pick) return pick.i;
  const first = rows[0];
  if (first && first.category === category && rows.length > 1 && isBlank(first)) return 0;
  return -1;
}

/** Add one to (or take one from) the luggage of `kind`, keeping it spread evenly. */
export function adjustLuggage(rows: TravellerRow[], kind: LuggageKind, delta: 1 | -1): TravellerRow[] {
  if (rows.length === 0) return rows;
  let target = -1;
  rows.forEach((r, i) => {
    const v = r.luggage[kind];
    if (delta > 0) {
      if (target < 0 || v < rows[target].luggage[kind]) target = i;
    } else if (v > 0 && (target < 0 || v >= rows[target].luggage[kind])) {
      target = i;
    }
  });
  if (target < 0) return rows;
  return rows.map((r, i) =>
    i === target ? { ...r, luggage: { ...r.luggage, [kind]: Math.max(0, r.luggage[kind] + delta) } } : r
  );
}

/** Flag exactly `n` passengers as needing a wheelchair space (keeps existing flags first). */
export function setWheelchairCount(rows: TravellerRow[], n: number): TravellerRow[] {
  const current = rows.filter((r) => r.wheelchairSpace).length;
  if (n === current) return rows;
  if (n > current) {
    let toAdd = n - current;
    return rows.map((r) => {
      if (toAdd > 0 && !r.wheelchairSpace) {
        toAdd--;
        return { ...r, wheelchairSpace: true };
      }
      return r;
    });
  }
  let toDrop = current - n;
  return [...rows]
    .reverse()
    .map((r) => {
      if (toDrop > 0 && r.wheelchairSpace) {
        toDrop--;
        return { ...r, wheelchairSpace: false };
      }
      return r;
    })
    .reverse();
}

/** The value every row shares, or null when they differ. */
export function sharedValue<T>(rows: TravellerRow[], get: (r: TravellerRow) => T): T | null {
  if (rows.length === 0) return null;
  const first = get(rows[0]);
  return rows.every((r) => get(r) === first) ? first : null;
}
