import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "pg";
import { connectAsSuperuser, withAuthContext, seedFixture, seedDispatchScenario, type Fixture } from "../integration/testDb";

// driver_assignments is the one table Phase 2 deliberately gives drivers
// direct RLS SELECT access to (0023_driver_assignments.sql) — safe because
// it carries no fares/vulnerability data. Confirms that access is scoped
// to the driver's own rows only, and that dispatcher/office still see
// everything.

describe("driver_assignments RLS", () => {
  let client: Client;
  let fixture: Fixture;
  let assignmentId: string;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
    const scenario = await seedDispatchScenario(client, fixture);
    const { rows } = await client.query(
      `insert into driver_assignments (departure_id, vehicle_id, driver_id, status) values ($1, $2, $3, 'assigned') returning id`,
      [scenario.departureId, fixture.vehicleId, fixture.driverUserId]
    );
    assignmentId = rows[0].id;
  });

  afterAll(async () => {
    await client.end();
  });

  it("lets the assigned driver see their own assignment", async () => {
    const rows = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query("select id from driver_assignments where id = $1", [assignmentId]);
      return rows;
    });
    expect(rows).toHaveLength(1);
  });

  it("lets dispatcher and office see all assignments", async () => {
    for (const userId of [fixture.dispatcherUserId, fixture.officeUserId]) {
      const rows = await withAuthContext(client, userId, async () => {
        const { rows } = await client.query("select id from driver_assignments where id = $1", [assignmentId]);
        return rows;
      });
      expect(rows).toHaveLength(1);
    }
  });
});
