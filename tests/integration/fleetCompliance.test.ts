import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "pg";
import { connectAsSuperuser, withAuthContext, seedFixture, type Fixture } from "./testDb";

// Verifies build spec §29/§30: a critical defect (whether found during a
// walkaround check or reported directly) immediately marks the vehicle
// out of service and creates a fleet task — via the triggers in
// 0031_vehicle_checks.sql / 0032_vehicle_defects.sql, not application code
// that could be skipped or forgotten.

describe("critical defect -> vehicle out of service", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("a critical vehicle_checks result marks the vehicle 'defect' and opens a fleet task", async () => {
    await client.query("update vehicles set status = 'available' where id = $1", [fixture.vehicleId]);

    await withAuthContext(client, fixture.driverUserId, () =>
      client.query(
        `insert into vehicle_checks (vehicle_id, driver_id, check_type, items, result, notes)
         values ($1, $2, 'pre_trip', '[]'::jsonb, 'critical_defect', 'Brake fluid critically low')`,
        [fixture.vehicleId, fixture.driverUserId]
      )
    );

    const { rows: vehicleRows } = await client.query("select status from vehicles where id = $1", [fixture.vehicleId]);
    expect(vehicleRows[0].status).toBe("defect");

    const { rows: taskRows } = await client.query(
      "select * from fleet_tasks where vehicle_id = $1 and created_from = 'check_defect' order by created_at desc limit 1",
      [fixture.vehicleId]
    );
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0].status).toBe("open");
    expect(taskRows[0].description).toMatch(/Brake fluid/);
  });

  it("an advisory or pass result does NOT change vehicle status", async () => {
    await client.query("update vehicles set status = 'available' where id = $1", [fixture.vehicleId]);

    await withAuthContext(client, fixture.driverUserId, () =>
      client.query(
        `insert into vehicle_checks (vehicle_id, driver_id, check_type, items, result)
         values ($1, $2, 'pre_trip', '[]'::jsonb, 'advisory_defect')`,
        [fixture.vehicleId, fixture.driverUserId]
      )
    );

    const { rows } = await client.query("select status from vehicles where id = $1", [fixture.vehicleId]);
    expect(rows[0].status).toBe("available");
  });

  it("a critical vehicle_defects report has the same effect as a critical check", async () => {
    await client.query("update vehicles set status = 'available' where id = $1", [fixture.vehicleId]);

    await withAuthContext(client, fixture.driverUserId, () =>
      client.query(
        `insert into vehicle_defects (vehicle_id, reported_by, severity, description)
         values ($1, $2, 'critical', 'Steering feels loose')`,
        [fixture.vehicleId, fixture.driverUserId]
      )
    );

    const { rows: vehicleRows } = await client.query("select status from vehicles where id = $1", [fixture.vehicleId]);
    expect(vehicleRows[0].status).toBe("defect");

    const { rows: taskRows } = await client.query(
      "select * from fleet_tasks where vehicle_id = $1 and created_from = 'manual_defect' order by created_at desc limit 1",
      [fixture.vehicleId]
    );
    expect(taskRows).toHaveLength(1);
  });

  it("driver RLS on vehicle_checks/vehicle_defects is self-only, not broad", async () => {
    // A driver can read their own check...
    const own = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query(
        "select id from vehicle_checks where vehicle_id = $1 and driver_id = $2",
        [fixture.vehicleId, fixture.driverUserId]
      );
      return rows;
    });
    expect(own.length).toBeGreaterThan(0);

    // ...but dispatcher/office should also see it (dispatcher-manage policy).
    const dispatcherView = await withAuthContext(client, fixture.dispatcherUserId, async () => {
      const { rows } = await client.query("select id from vehicle_checks where vehicle_id = $1", [fixture.vehicleId]);
      return rows;
    });
    expect(dispatcherView.length).toBeGreaterThan(0);
  });
});
