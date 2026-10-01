import { describe, expect, it } from "vitest";
import { capacityMessage, isWaitlistable, parseCapacityCode } from "./capacityMessages";

describe("parseCapacityCode", () => {
  it("reads the bare code Postgres puts in the message", () => {
    expect(parseCapacityCode("no_seats")).toBe("no_seats");
    expect(parseCapacityCode("unsecured_cap_reached")).toBe("unsecured_cap_reached");
  });

  it("finds a code wrapped in other text", () => {
    expect(parseCapacityCode('error: no_hold_capacity (detail)')).toBe("no_hold_capacity");
  });

  it("returns null for unrelated errors", () => {
    expect(parseCapacityCode("duplicate key value")).toBeNull();
    expect(parseCapacityCode(undefined)).toBeNull();
  });
});

describe("isWaitlistable", () => {
  it("offers the waitlist only for capacity codes", () => {
    expect(isWaitlistable("no_wheelchair_space")).toBe(true);
    expect(isWaitlistable("crossing_limit_reached")).toBe(true);
    expect(isWaitlistable("departure_not_bookable")).toBe(false);
    expect(isWaitlistable(null)).toBe(false);
  });

  it("has a plain-English message for every code", () => {
    expect(capacityMessage("no_seats")).toMatch(/seats/);
  });
});
