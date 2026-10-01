import type { CapacityFailureCode } from "@/types/database";

/** Capacity codes raised by allocate_booking_capacity() where the right
 * next step is to offer the caller a waitlist place (build spec §13). */
export const WAITLISTABLE_CODES = [
  "no_seats",
  "crossing_limit_reached",
  "no_hold_capacity",
  "unsecured_cap_reached",
  "no_wheelchair_space",
  "no_vehicle_capacity",
] as const satisfies readonly CapacityFailureCode[];

export type WaitlistableCode = (typeof WAITLISTABLE_CODES)[number];

const MESSAGES: Record<CapacityFailureCode, string> = {
  no_seats: "There aren't enough seats left on this departure for this party.",
  crossing_limit_reached: "This departure has reached the crossing passenger limit.",
  no_hold_capacity: "There isn't enough luggage space left in the hold for this party's bags.",
  no_parcel_capacity: "There isn't enough parcel space left on this departure.",
  no_wheelchair_space: "There's no wheelchair space left on this departure.",
  unsecured_cap_reached:
    "Too many unpaid provisional bookings are already holding this departure. Take a deposit (or waive it) to book, or add the caller to the waitlist.",
  no_vehicle_capacity: "The chosen vehicle is full.",
  not_authorized: "You're not allowed to make bookings.",
  departure_not_found: "That departure no longer exists. Refresh and pick another.",
  departure_not_bookable: "That departure is no longer open for booking. Refresh and pick another.",
};

/** Finds a capacity failure code inside an RPC error message. Postgres puts
 * the bare code in the message, but match loosely in case anything wraps it. */
export function parseCapacityCode(message: string | null | undefined): CapacityFailureCode | null {
  if (!message) return null;
  const codes = Object.keys(MESSAGES) as CapacityFailureCode[];
  // Longest first so no partial code shadows a longer one.
  codes.sort((a, b) => b.length - a.length);
  return codes.find((c) => message.includes(c)) ?? null;
}

export function capacityMessage(code: CapacityFailureCode): string {
  return MESSAGES[code];
}

export function isWaitlistable(code: CapacityFailureCode | null): code is WaitlistableCode {
  return code !== null && (WAITLISTABLE_CODES as readonly string[]).includes(code);
}
