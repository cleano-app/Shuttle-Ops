// Build spec §13: "When capacity frees, the system reruns the full
// capacity check before making an offer... If they don't fit, skip to the
// next entry and leave the first waiting." Extracted out of
// src/app/actions/waitlist.ts's offerNextWaiting() so the FIFO-skip
// behaviour is unit-testable without a database — the action itself is
// now a thin wrapper that fetches entries/the capacity summary once and
// hands them to this function.

export interface WaitlistEntryForPick {
  id: string;
  seats_wanted: number;
  luggage_estimate: number;
  wheelchair_requirement: boolean;
}

export interface CapacitySnapshot {
  seats_released: number;
  seats_used: number;
  hold_capacity_units: number;
  hold_used: number;
  wheelchair_capacity: number;
  wheelchair_used: number;
}

export function entryFitsCapacity(entry: WaitlistEntryForPick, summary: CapacitySnapshot): boolean {
  const seatsFit = summary.seats_released - summary.seats_used >= entry.seats_wanted;
  const holdFits = summary.hold_capacity_units - summary.hold_used >= entry.luggage_estimate;
  const wheelchairFits =
    !entry.wheelchair_requirement || summary.wheelchair_capacity - summary.wheelchair_used > 0;
  return seatsFit && holdFits && wheelchairFits;
}

/** Returns the first entry (in the given, i.e. FIFO, order) that fits the
 * current capacity snapshot, or null if nobody does. Never mutates or
 * reorders `entries` — entries that don't fit are simply left waiting. */
export function pickNextWaitlistOffer<T extends WaitlistEntryForPick>(
  entries: T[],
  summary: CapacitySnapshot
): T | null {
  for (const entry of entries) {
    if (entryFitsCapacity(entry, summary)) return entry;
  }
  return null;
}
