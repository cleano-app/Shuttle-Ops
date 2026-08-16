import { describe, it, expect } from "vitest";
import { buildAddressSnapshot, type AddressLike } from "./buildSnapshot";

const address: AddressLike = {
  id: "addr-1",
  line1: "22 Stamford Hill",
  line2: null,
  city: "London",
  postcode: "N16 6XB",
  country: "GB",
  formatted_address: "22 Stamford Hill, London N16 6XB",
  access_notes: "Ring twice",
  fixed_point_name: null,
};

describe("buildAddressSnapshot", () => {
  it("captures every display field the address currently has", () => {
    const snapshot = buildAddressSnapshot(address);
    expect(snapshot.address_id).toBe("addr-1");
    expect(snapshot.line1).toBe("22 Stamford Hill");
    expect(snapshot.postcode).toBe("N16 6XB");
    expect(snapshot.access_notes).toBe("Ring twice");
  });

  it("stamps a snapshot time so it's clear when the address was captured", () => {
    const before = Date.now();
    const snapshot = buildAddressSnapshot(address);
    const snapshotTime = new Date(snapshot.snapshotted_at).getTime();
    expect(snapshotTime).toBeGreaterThanOrEqual(before);
  });

  it("is independent of later edits to the source address (plain object copy)", () => {
    const mutable = { ...address };
    const snapshot = buildAddressSnapshot(mutable);
    mutable.line1 = "Changed Street";
    expect(snapshot.line1).toBe("22 Stamford Hill");
  });
});
