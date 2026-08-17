import { describe, it, expect } from "vitest";
import { assertVehicleAssignable } from "./vehicles";

describe("assertVehicleAssignable", () => {
  it("allows an available vehicle for anyone", async () => {
    expect(await assertVehicleAssignable("available", false, null)).toBeNull();
    expect(await assertVehicleAssignable("available", true, null)).toBeNull();
  });

  it("blocks a non-admin from assigning an unavailable vehicle, override reason or not", async () => {
    expect(await assertVehicleAssignable("defect", false, null)).toMatch(/Only Admin/);
    expect(await assertVehicleAssignable("defect", false, "I really need it")).toMatch(/Only Admin/);
  });

  it("blocks an admin without a reason, but allows one with a reason", async () => {
    expect(await assertVehicleAssignable("maintenance", true, null)).toMatch(/override reason/);
    expect(await assertVehicleAssignable("maintenance", true, "")).toMatch(/override reason/);
    expect(await assertVehicleAssignable("maintenance", true, "   ")).toMatch(/override reason/);
    expect(await assertVehicleAssignable("maintenance", true, "Emergency cover, MOT expires tomorrow")).toBeNull();
  });

  it("treats every non-'available' status the same way (accident, unavailable, assigned)", async () => {
    for (const status of ["accident", "unavailable", "assigned"]) {
      expect(await assertVehicleAssignable(status, false, null)).not.toBeNull();
      expect(await assertVehicleAssignable(status, true, "reason")).toBeNull();
    }
  });
});
