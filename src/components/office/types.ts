import type { Currency, PassengerCategory } from "@/types/database";
import { computeFare } from "@/lib/tariffs/computeFare";
import type { TariffRow } from "@/lib/tariffs/pickTariff";

/** Default deposit per passenger, per currency (app_settings
 * default_deposit_gbp/eur). null = not configured yet. */
export type DepositDefaults = Record<Currency, number | null>;

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
  /** null = full fare from the price list (the default); a number = what
   * Office agreed the passenger pays, the charity covering the rest. */
  contribution: number | null;
  sponsored: number;
  depositWaived: boolean;
  /** True when this row is a passenger with passengers.deposit_waiver_standing
   * — the waiver auto-applies (build spec §10) and can't be unticked here. */
  standingWaiver: boolean;
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
    contribution: null,
    sponsored: 0,
    depositWaived: false,
    standingWaiver: false,
  };
}

/** Fare for one passenger on one leg; a blank contribution means they pay
 * the full price-list fare less any sponsorship. */
export function fareFor(row: TravellerRow, tariff: TariffRow, currency: Currency) {
  const base = { tariff, currency, luggage: row.luggage, sponsored: row.sponsored };
  if (row.contribution != null) return computeFare({ ...base, contribution: row.contribution });
  const full = computeFare({ ...base, contribution: 0 }).notionalFare;
  return computeFare({ ...base, contribution: Math.max(0, full - row.sponsored) });
}
