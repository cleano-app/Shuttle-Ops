import { describe, it, expect } from "vitest";
import { computeSuggestedPay } from "./computeSuggestedPay";

describe("computeSuggestedPay", () => {
  it("returns 0 when the driver has no pay_type set", () => {
    const result = computeSuggestedPay({
      payType: null,
      payRate: 15,
      totalHours: 8,
      totalTrips: 2,
      totalDaysWorked: 1,
    });
    expect(result).toBe(0);
  });

  it("returns 0 when the driver has no pay_rate set", () => {
    const result = computeSuggestedPay({
      payType: "hourly",
      payRate: null,
      totalHours: 8,
      totalTrips: 2,
      totalDaysWorked: 1,
    });
    expect(result).toBe(0);
  });

  it("computes hourly pay as hours * rate", () => {
    const result = computeSuggestedPay({
      payType: "hourly",
      payRate: 12.5,
      totalHours: 7.5,
      totalTrips: 1,
      totalDaysWorked: 1,
    });
    expect(result).toBe(93.75);
  });

  it("computes per_trip pay as trips * rate, ignoring hours", () => {
    const result = computeSuggestedPay({
      payType: "per_trip",
      payRate: 40,
      totalHours: 999,
      totalTrips: 3,
      totalDaysWorked: 1,
    });
    expect(result).toBe(120);
  });

  it("computes per_day pay as days worked * rate, ignoring hours and trips", () => {
    const result = computeSuggestedPay({
      payType: "per_day",
      payRate: 100,
      totalHours: 1,
      totalTrips: 1,
      totalDaysWorked: 4,
    });
    expect(result).toBe(400);
  });

  it("rounds to 2 decimal places, correcting floating point drift", () => {
    const result = computeSuggestedPay({
      payType: "hourly",
      payRate: 10.1,
      totalHours: 3,
      totalTrips: 0,
      totalDaysWorked: 0,
    });
    // 10.1 * 3 = 30.299999999999997 in raw floating point
    expect(result).toBe(30.3);
  });

  it("returns 0 for zero hours/trips/days even with a rate set", () => {
    expect(
      computeSuggestedPay({ payType: "hourly", payRate: 15, totalHours: 0, totalTrips: 0, totalDaysWorked: 0 })
    ).toBe(0);
  });
});
