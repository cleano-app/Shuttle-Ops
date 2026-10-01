import { describe, expect, it } from "vitest";
import { emptyTravellerRow, type TravellerRow } from "../types";
import { adjustLuggage, countByCategory, newPartyRow, removableIndex, setWheelchairCount } from "./party";

function row(patch: Partial<TravellerRow> = {}): TravellerRow {
  return { ...emptyTravellerRow("GBP"), ...patch };
}

describe("party helpers", () => {
  it("counts rows per category", () => {
    const c = countByCategory([row(), row({ category: "girl" }), row({ category: "girl" })]);
    expect(c).toMatchObject({ man: 1, girl: 2, woman: 0 });
  });

  it("new rows copy the party's addresses and amounts", () => {
    const template = row({ pickupAddressId: "p", dropoffAddressId: "d", contribution: 5, depositWaived: true });
    const r = newPartyRow("infant", "GBP", template);
    expect(r).toMatchObject({ category: "infant", occupiesSeat: false, pickupAddressId: "p", dropoffAddressId: "d" });
    expect(r).toMatchObject({ contribution: 5, depositWaived: true, passengerId: null });
  });

  it("removes the last unnamed row of a kind, never the named caller", () => {
    const caller = row({ passengerId: "c", passengerName: "Ann Cohen", category: "woman" });
    const named = row({ passengerName: "Ben", category: "boy" });
    const blank = row({ category: "boy" });
    expect(removableIndex([caller, named, blank], "boy")).toBe(2);
    expect(removableIndex([caller, named], "boy")).toBe(1);
    expect(removableIndex([caller, named], "woman")).toBe(-1);
    // A blank first row may go if someone else is still travelling.
    expect(removableIndex([row(), row({ category: "woman" })], "man")).toBe(0);
    expect(removableIndex([row()], "man")).toBe(-1);
  });

  it("spreads luggage evenly", () => {
    let rows = [row(), row()].map((r) => ({ ...r, luggage: { ...r.luggage, large: 0 } }));
    rows = adjustLuggage(rows, "large", 1);
    rows = adjustLuggage(rows, "large", 1);
    expect(rows.map((r) => r.luggage.large)).toEqual([1, 1]);
    rows = adjustLuggage(rows, "large", -1);
    expect(rows.map((r) => r.luggage.large).reduce((a, b) => a + b)).toBe(1);
  });

  it("sets the number of wheelchair spaces", () => {
    let rows = [row(), row(), row()];
    rows = setWheelchairCount(rows, 2);
    expect(rows.map((r) => r.wheelchairSpace)).toEqual([true, true, false]);
    rows = setWheelchairCount(rows, 1);
    expect(rows.map((r) => r.wheelchairSpace)).toEqual([true, false, false]);
  });
});
