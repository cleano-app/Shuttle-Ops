import { describe, it, expect } from "vitest";
import { entryFitsCapacity, pickNextWaitlistOffer, type CapacitySnapshot } from "./pickNextOffer";

const roomyCapacity: CapacitySnapshot = {
  seats_released: 10,
  seats_used: 5,
  hold_capacity_units: 20,
  hold_used: 5,
  wheelchair_capacity: 2,
  wheelchair_used: 0,
};

describe("entryFitsCapacity", () => {
  it("fits when seats/hold/wheelchair are all available", () => {
    expect(
      entryFitsCapacity({ id: "a", seats_wanted: 3, luggage_estimate: 5, wheelchair_requirement: false }, roomyCapacity)
    ).toBe(true);
  });

  it("does not fit when there aren't enough free seats", () => {
    expect(
      entryFitsCapacity({ id: "a", seats_wanted: 6, luggage_estimate: 0, wheelchair_requirement: false }, roomyCapacity)
    ).toBe(false);
  });

  it("fits exactly at the seat boundary", () => {
    expect(
      entryFitsCapacity({ id: "a", seats_wanted: 5, luggage_estimate: 0, wheelchair_requirement: false }, roomyCapacity)
    ).toBe(true);
  });

  it("does not fit when hold space is insufficient", () => {
    expect(
      entryFitsCapacity({ id: "a", seats_wanted: 1, luggage_estimate: 16, wheelchair_requirement: false }, roomyCapacity)
    ).toBe(false);
  });

  it("ignores wheelchair capacity when the entry doesn't need it", () => {
    const noWheelchairLeft: CapacitySnapshot = { ...roomyCapacity, wheelchair_capacity: 1, wheelchair_used: 1 };
    expect(
      entryFitsCapacity({ id: "a", seats_wanted: 1, luggage_estimate: 0, wheelchair_requirement: false }, noWheelchairLeft)
    ).toBe(true);
  });

  it("does not fit when wheelchair space is required but none is free", () => {
    const noWheelchairLeft: CapacitySnapshot = { ...roomyCapacity, wheelchair_capacity: 1, wheelchair_used: 1 };
    expect(
      entryFitsCapacity({ id: "a", seats_wanted: 1, luggage_estimate: 0, wheelchair_requirement: true }, noWheelchairLeft)
    ).toBe(false);
  });
});

describe("pickNextWaitlistOffer", () => {
  it("returns null when the list is empty", () => {
    expect(pickNextWaitlistOffer([], roomyCapacity)).toBeNull();
  });

  it("picks the first entry when it fits", () => {
    const entries = [
      { id: "first", seats_wanted: 1, luggage_estimate: 0, wheelchair_requirement: false },
      { id: "second", seats_wanted: 1, luggage_estimate: 0, wheelchair_requirement: false },
    ];
    expect(pickNextWaitlistOffer(entries, roomyCapacity)?.id).toBe("first");
  });

  it("skips an entry that doesn't fit and offers the next one that does, leaving the skipped one untouched", () => {
    const entries = [
      { id: "too-big", seats_wanted: 6, luggage_estimate: 0, wheelchair_requirement: false },
      { id: "fits", seats_wanted: 2, luggage_estimate: 0, wheelchair_requirement: false },
    ];
    const picked = pickNextWaitlistOffer(entries, roomyCapacity);
    expect(picked?.id).toBe("fits");
    // The function is pure — the skipped entry's own object is untouched.
    expect(entries[0]).toEqual({ id: "too-big", seats_wanted: 6, luggage_estimate: 0, wheelchair_requirement: false });
  });

  it("returns null when nobody in the list fits", () => {
    const entries = [
      { id: "too-big-1", seats_wanted: 6, luggage_estimate: 0, wheelchair_requirement: false },
      { id: "too-big-2", seats_wanted: 7, luggage_estimate: 0, wheelchair_requirement: false },
    ];
    expect(pickNextWaitlistOffer(entries, roomyCapacity)).toBeNull();
  });

  it("preserves FIFO order — never picks a later entry over an earlier one that also fits", () => {
    const entries = [
      { id: "first-fits", seats_wanted: 1, luggage_estimate: 0, wheelchair_requirement: false },
      { id: "also-fits", seats_wanted: 1, luggage_estimate: 0, wheelchair_requirement: false },
    ];
    expect(pickNextWaitlistOffer(entries, roomyCapacity)?.id).toBe("first-fits");
  });
});
