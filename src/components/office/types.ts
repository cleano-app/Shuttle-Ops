import type { Currency, PassengerCategory } from "@/types/database";

/** One row in the Booking Console's traveller list — the client-side shape
 * that gets turned into a BookingPassengerInput (src/types/database.ts) at
 * submit time. Kept separate from BookingPassengerInput because this shape
 * carries UI-only fields (passengerName, address labels for display) that
 * don't belong in the RPC payload. */
export interface TravellerRow {
  key: string;
  passengerId: string | null;
  passengerName: string;
  category: PassengerCategory;
  occupiesSeat: boolean;
  pickupAddressId: string | null;
  pickupLabel: string;
  pickupSnapshot: Record<string, unknown> | null;
  dropoffAddressId: string | null;
  dropoffLabel: string;
  dropoffSnapshot: Record<string, unknown> | null;
  wheelchairSpace: boolean;
  mobilityNeeds: string;
  luggage: { large: number; small: number; hand: number; oversize: number };
  contribution: number;
  sponsored: number;
  depositWaived: boolean;
}

export function defaultOccupiesSeat(category: PassengerCategory): boolean {
  // Infant restraint/seating rule is jurisdiction- and vehicle-dependent
  // and explicitly unconfirmed pre-launch (build spec §40.2 item 1) — this
  // default (infant = lap, no seat) is a starting point Office can
  // override per booking via the toggle, not a settled policy.
  return category !== "infant";
}

export function emptyTravellerRow(currency: Currency): TravellerRow {
  void currency;
  return {
    key: crypto.randomUUID(),
    passengerId: null,
    passengerName: "",
    category: "man",
    occupiesSeat: true,
    pickupAddressId: null,
    pickupLabel: "",
    pickupSnapshot: null,
    dropoffAddressId: null,
    dropoffLabel: "",
    dropoffSnapshot: null,
    wheelchairSpace: false,
    mobilityNeeds: "",
    luggage: { large: 0, small: 0, hand: 1, oversize: 0 },
    contribution: 0,
    sponsored: 0,
    depositWaived: false,
  };
}
