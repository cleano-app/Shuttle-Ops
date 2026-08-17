import type { TariffLike } from "./computeFare";
import type { DepartureDirection, PassengerCategory } from "@/types/database";

// Extracted out of src/components/office/BookingFormPanel.tsx (Phase 1) so
// the same selection logic can be reused server-side (the Phase 5 online
// booking action) without importing from a "use client" component file.

export interface TariffRow extends TariffLike {
  category: PassengerCategory | null;
  direction: DepartureDirection | null;
}

/** Most specific match first: exact category+direction, then category with
 * direction-agnostic (null), then a fully generic route-wide row. Prices
 * are still copied onto the booking at submit time — this selection only
 * decides which row's numbers apply, per build spec §14. */
export function pickTariff(
  tariffs: TariffRow[],
  category: PassengerCategory,
  direction: DepartureDirection
): TariffRow | null {
  return (
    tariffs.find((t) => t.category === category && t.direction === direction) ??
    tariffs.find((t) => t.category === category && t.direction === null) ??
    tariffs.find((t) => t.category === null && t.direction === direction) ??
    tariffs.find((t) => t.category === null && t.direction === null) ??
    null
  );
}
