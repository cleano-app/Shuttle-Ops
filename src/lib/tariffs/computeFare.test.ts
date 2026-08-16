import { describe, it, expect } from "vitest";
import { computeFare, type TariffLike } from "./computeFare";

const baseTariff: TariffLike = {
  base_fare_gbp: 40,
  base_fare_eur: 45,
  luggage_large_allowance: 1,
  luggage_small_allowance: 1,
  luggage_hand_allowance: 1,
  luggage_additional_charge_gbp: 10,
  luggage_additional_charge_eur: 12,
  luggage_oversize_charge_gbp: 20,
  luggage_oversize_charge_eur: 24,
  capacity_units_per_large: 1,
  capacity_units_per_small: 1,
  capacity_units_per_oversize: 2,
};

const noLuggage = { large: 0, small: 0, hand: 0, oversize: 0 };

describe("computeFare", () => {
  it("balances notionalFare = contribution + sponsored + subsidy", () => {
    const result = computeFare({
      tariff: baseTariff,
      currency: "GBP",
      luggage: noLuggage,
      contribution: 20,
      sponsored: 10,
    });
    expect(result.contribution + result.sponsored + result.subsidy).toBeCloseTo(
      result.notionalFare,
      2
    );
  });

  it("populates notionalFare even for a fully free (zero-contribution) traveller", () => {
    const result = computeFare({
      tariff: baseTariff,
      currency: "GBP",
      luggage: noLuggage,
      contribution: 0,
      sponsored: 0,
    });
    expect(result.notionalFare).toBe(40);
    expect(result.subsidy).toBe(40);
    expect(result.isValid).toBe(true);
  });

  it("keeps GBP and EUR pricing fully independent", () => {
    const gbp = computeFare({
      tariff: baseTariff,
      currency: "GBP",
      luggage: noLuggage,
      contribution: 0,
      sponsored: 0,
    });
    const eur = computeFare({
      tariff: baseTariff,
      currency: "EUR",
      luggage: noLuggage,
      contribution: 0,
      sponsored: 0,
    });
    expect(gbp.baseFare).toBe(40);
    expect(eur.baseFare).toBe(45);
    // Not a currency conversion of one another — independently set values
    // (build spec §34).
    expect(eur.baseFare).not.toBeCloseTo(gbp.baseFare * 1.15, 1);
  });

  it("charges nothing for luggage within the allowance", () => {
    const result = computeFare({
      tariff: baseTariff,
      currency: "GBP",
      luggage: { large: 1, small: 1, hand: 1, oversize: 0 },
      contribution: 40,
      sponsored: 0,
    });
    expect(result.luggageCharge).toBe(0);
    expect(result.luggageUnitsConsumed).toBe(2); // 1 large + 1 small, hand doesn't consume hold
  });

  it("charges the additional rate per item over the allowance", () => {
    const result = computeFare({
      tariff: baseTariff,
      currency: "GBP",
      luggage: { large: 2, small: 0, hand: 0, oversize: 0 },
      contribution: 0,
      sponsored: 0,
    });
    // 1 large is within allowance, 1 large is extra at £10.
    expect(result.luggageCharge).toBe(10);
    expect(result.notionalFare).toBe(50);
  });

  it("charges the oversize rate per oversize item regardless of allowance", () => {
    const result = computeFare({
      tariff: baseTariff,
      currency: "EUR",
      luggage: { large: 0, small: 0, hand: 0, oversize: 2 },
      contribution: 0,
      sponsored: 0,
    });
    expect(result.luggageCharge).toBe(48); // 2 * 24
    expect(result.luggageUnitsConsumed).toBe(4); // 2 * capacity_units_per_oversize
  });

  it("flags isValid=false when contribution + sponsored exceeds the notional fare", () => {
    const result = computeFare({
      tariff: baseTariff,
      currency: "GBP",
      luggage: noLuggage,
      contribution: 30,
      sponsored: 30,
    });
    expect(result.isValid).toBe(false);
    expect(result.subsidy).toBeLessThan(0);
  });
});
