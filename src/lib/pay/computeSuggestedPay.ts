import type { DriverPayType } from "@/types/database";

// Build spec §25: "The system calculates a suggested amount from recorded
// duty information. Office approves the final amount." This function is
// the "calculates a suggested amount" part only — src/app/actions/
// driverPay.ts's generatePayStatement() writes the result into
// driver_pay_statements.base_pay on a 'draft' row; nothing pays out or
// marks a statement 'approved' without an explicit Office action.

export interface ComputeSuggestedPayInput {
  payType: DriverPayType | null;
  payRate: number | null;
  totalHours: number;
  totalTrips: number;
  totalDaysWorked: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Returns 0 (not an error) when the driver has no pay_type/pay_rate set
 * yet — Office sets one on the driver's profile before a real statement
 * can be generated; a zero suggestion is a visible prompt to do that,
 * not a silent wrong number. */
export function computeSuggestedPay(input: ComputeSuggestedPayInput): number {
  if (!input.payType || input.payRate == null) return 0;

  switch (input.payType) {
    case "hourly":
      return round2(input.totalHours * input.payRate);
    case "per_trip":
      return round2(input.totalTrips * input.payRate);
    case "per_day":
      return round2(input.totalDaysWorked * input.payRate);
    default:
      return 0;
  }
}
