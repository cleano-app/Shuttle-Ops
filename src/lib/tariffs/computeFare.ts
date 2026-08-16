import type { Currency } from "@/types/database";

// Single source of truth for pricing (build spec §14/§34) — called by both
// the Booking Console (src/components/office/BookingFormPanel.tsx, for the
// live fare preview) and its own unit tests. Prices/weightings are read
// from a `tariffs` row and copied onto booking_passengers at booking time;
// this function never reads or writes the database itself, so changing a
// tariff later can never retroactively change a historical booking.

export interface TariffLike {
  base_fare_gbp: number;
  base_fare_eur: number;
  luggage_large_allowance: number;
  luggage_small_allowance: number;
  luggage_hand_allowance: number;
  luggage_additional_charge_gbp: number;
  luggage_additional_charge_eur: number;
  luggage_oversize_charge_gbp: number;
  luggage_oversize_charge_eur: number;
  capacity_units_per_large: number;
  capacity_units_per_small: number;
  capacity_units_per_oversize: number;
}

export interface LuggageCounts {
  large: number;
  small: number;
  hand: number;
  oversize: number;
}

export interface ComputeFareInput {
  tariff: TariffLike;
  currency: Currency;
  luggage: LuggageCounts;
  /** What the passenger pays — an Office decision, not computed here. */
  contribution: number;
  /** External sponsorship amount — an Office decision, not computed here. */
  sponsored: number;
}

export interface ComputeFareResult {
  baseFare: number;
  luggageCharge: number;
  /** notionalFare = baseFare + luggageCharge. Populated even when
   * contribution/sponsored/subsidy are all zero (a fully free journey) —
   * build spec §34: "notional_fare is populated on every passenger
   * including free travellers." */
  notionalFare: number;
  contribution: number;
  sponsored: number;
  /** Derived so that notionalFare === contribution + sponsored + subsidy
   * always holds exactly — this is what lets the DB CHECK constraint on
   * booking_passengers (0015_booking_passengers.sql) pass. */
  subsidy: number;
  luggageUnitsConsumed: number;
  /** False when contribution + sponsored exceeds notionalFare (subsidy
   * would go negative) — the caller (BookingFormPanel) must show a
   * validation error and block submission rather than let this reach the
   * capacity-allocation RPC, since "money decisions stay human" (§1
   * principle 11) means this function only computes, it never corrects. */
  isValid: boolean;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeFare(input: ComputeFareInput): ComputeFareResult {
  const isGbp = input.currency === "GBP";
  const { tariff, luggage } = input;

  const baseFare = isGbp ? tariff.base_fare_gbp : tariff.base_fare_eur;
  const additionalCharge = isGbp
    ? tariff.luggage_additional_charge_gbp
    : tariff.luggage_additional_charge_eur;
  const oversizeCharge = isGbp
    ? tariff.luggage_oversize_charge_gbp
    : tariff.luggage_oversize_charge_eur;

  const extraLarge = Math.max(0, luggage.large - tariff.luggage_large_allowance);
  const extraSmall = Math.max(0, luggage.small - tariff.luggage_small_allowance);
  const extraHand = Math.max(0, luggage.hand - tariff.luggage_hand_allowance);

  const luggageCharge = round2(
    (extraLarge + extraSmall + extraHand) * additionalCharge + luggage.oversize * oversizeCharge
  );

  // Hand luggage travels with the passenger and doesn't consume hold
  // capacity — only large/small/oversize items do.
  const luggageUnitsConsumed =
    luggage.large * tariff.capacity_units_per_large +
    luggage.small * tariff.capacity_units_per_small +
    luggage.oversize * tariff.capacity_units_per_oversize;

  const notionalFare = round2(baseFare + luggageCharge);
  const contribution = round2(input.contribution);
  const sponsored = round2(input.sponsored);
  const subsidy = round2(notionalFare - contribution - sponsored);

  return {
    baseFare,
    luggageCharge,
    notionalFare,
    contribution,
    sponsored,
    subsidy,
    luggageUnitsConsumed,
    isValid: subsidy >= -0.001,
  };
}
