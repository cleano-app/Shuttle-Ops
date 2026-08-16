import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "pg";
import { connectAsSuperuser, withAuthContext, seedFixture, seedDispatchScenario, type Fixture } from "../integration/testDb";

// operational_stops/operational_stop_passengers deliberately have NO
// driver policy at all (0024_operational_stops.sql) — a driver's entire
// view of stops comes through get_driver_stop_manifest() instead
// (verified in tests/integration/driverFunctions.test.ts). This test
// proves the raw-table door is actually shut: even a driver with a real,
// current assignment covering this exact stop gets zero rows on a direct
// select, RLS-filtered rather than erroring.

describe("operational_stops RLS", () => {
  let client: Client;
  let fixture: Fixture;
  let stopId: string;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
    const scenario = await seedDispatchScenario(client, fixture);
    stopId = scenario.stopId;
    await client.query(
      `insert into driver_assignments (departure_id, vehicle_id, driver_id, status) values ($1, $2, $3, 'assigned')`,
      [scenario.departureId, fixture.vehicleId, fixture.driverUserId]
    );
  });

  afterAll(async () => {
    await client.end();
  });

  it("returns zero rows for the driver even though they're genuinely assigned to this stop", async () => {
    const rows = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query("select id from operational_stops where id = $1", [stopId]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("lets dispatcher and office read the stop directly", async () => {
    for (const userId of [fixture.dispatcherUserId, fixture.officeUserId]) {
      const rows = await withAuthContext(client, userId, async () => {
        const { rows } = await client.query("select id from operational_stops where id = $1", [stopId]);
        return rows;
      });
      expect(rows).toHaveLength(1);
    }
  });
});
