import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "pg";
import {
  connectAsSuperuser,
  withAuthContext,
  seedFixture,
  seedDispatchScenario,
  type Fixture,
  type DispatchScenario,
} from "./testDb";

// Verifies the security-definer functions in 0027_driver_functions.sql —
// the ONLY way a driver reads or writes anything about a departure/stop/
// passenger. These tests are the actual proof that a driver can never see
// or touch a stop outside their own assigned range, and never sees
// vulnerability_notes/fares/deposits through the manifest.

describe("driver security-definer functions", () => {
  let client: Client;
  let fixture: Fixture;
  let scenario: DispatchScenario;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
    scenario = await seedDispatchScenario(client, fixture);
    // Driver's assignment covers only stop sequence 0 (the "in range" stop) —
    // sequence 1 (outOfRangeStopId) is deliberately outside it.
    await client.query(
      `insert into driver_assignments (departure_id, vehicle_id, driver_id, from_stop_sequence, to_stop_sequence, status)
       values ($1, $2, $3, 0, 0, 'assigned')`,
      [scenario.departureId, fixture.vehicleId, fixture.driverUserId]
    );
  });

  afterAll(async () => {
    await client.end();
  });

  it("get_driver_assignments includes this scenario's assignment with safe summary fields", async () => {
    // Asserts "contains", not "equals length 1" — this reuses the same
    // seeded dev driver account across every test file in this suite (no
    // disposable per-run database exists yet, see the Phase 1 plan's open
    // decision #5), so other tests' own assignments legitimately coexist
    // here too.
    const result = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query("select get_driver_assignments() as result");
      return rows[0].result as { departure_id: string; assignment_status: string }[];
    });
    const assignment = result.find((a) => a.departure_id === scenario.departureId);
    expect(assignment).toBeDefined();
    expect(assignment!.assignment_status).toBe("assigned");
  });

  it("rejects a non-driver role outright, before even checking assignments", async () => {
    const result = await withAuthContext(client, fixture.dispatcherUserId, async () => {
      return client.query("select get_driver_assignments() as result").catch((e: Error) => e);
    });
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/not_authorized/);
  });

  it("get_driver_stop_manifest only returns the stop(s) within the driver's assigned range", async () => {
    const manifest = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query("select get_driver_stop_manifest($1) as result", [scenario.departureId]);
      return rows[0].result as { stops: { stop_id: string }[] };
    });
    const stopIds = manifest.stops.map((s) => s.stop_id);
    expect(stopIds).toContain(scenario.stopId);
    expect(stopIds).not.toContain(scenario.outOfRangeStopId);
  });

  it("get_driver_stop_manifest exposes only safe passenger fields, never fares/deposits/vulnerability data", async () => {
    const manifest = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query("select get_driver_stop_manifest($1) as result", [scenario.departureId]);
      return rows[0].result as { stops: { stop_id: string; passengers: Record<string, unknown>[] }[] };
    });
    const stop = manifest.stops.find((s) => s.stop_id === scenario.stopId);
    expect(stop?.passengers).toHaveLength(1);
    const passengerKeys = Object.keys(stop!.passengers[0]);
    expect(passengerKeys).toEqual(
      expect.arrayContaining(["full_name", "phone", "category", "luggage_large", "mobility_needs"])
    );
    for (const forbidden of ["vulnerability_notes", "notional_fare", "contribution", "sponsored", "subsidy", "deposit_status"]) {
      expect(passengerKeys).not.toContain(forbidden);
    }
  });

  it("record_stop_arrival succeeds for the assigned stop and rejects the out-of-range one", async () => {
    await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query(
        "select record_stop_arrival($1, $2, null, null) as result",
        [scenario.stopId, "11111111-1111-1111-1111-111111111111"]
      );
      expect(rows[0].result).toEqual({ status: "ok" });
    });

    const { rows: stopRows } = await client.query(
      "select status, actual_arrival_at from operational_stops where id = $1",
      [scenario.stopId]
    );
    expect(stopRows[0].status).toBe("arrived");
    expect(stopRows[0].actual_arrival_at).not.toBeNull();

    await expect(
      withAuthContext(client, fixture.driverUserId, () =>
        client.query("select record_stop_arrival($1, $2, null, null) as result", [
          scenario.outOfRangeStopId,
          "22222222-2222-2222-2222-222222222222",
        ])
      )
    ).rejects.toThrow(/not_your_stop/);
  });

  it("is idempotent by client_id — replaying the same arrival doesn't duplicate the duty event", async () => {
    const clientId = "33333333-3333-3333-3333-333333333333";
    await withAuthContext(client, fixture.driverUserId, () =>
      client.query("select record_stop_arrival($1, $2, null, null) as result", [scenario.stopId, clientId])
    );
    await withAuthContext(client, fixture.driverUserId, () =>
      client.query("select record_stop_arrival($1, $2, null, null) as result", [scenario.stopId, clientId])
    );
    const { rows } = await client.query("select count(*)::int as n from driver_duty_events where client_id = $1", [
      clientId,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it("record_stop_departure marks the stop completed", async () => {
    await withAuthContext(client, fixture.driverUserId, () =>
      client.query("select record_stop_departure($1) as result", [scenario.stopId])
    );
    const { rows } = await client.query("select status, actual_departure_at from operational_stops where id = $1", [
      scenario.stopId,
    ]);
    expect(rows[0].status).toBe("completed");
    expect(rows[0].actual_departure_at).not.toBeNull();
  });
});
