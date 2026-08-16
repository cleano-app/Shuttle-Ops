import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "pg";
import { connectAsSuperuser, withAuthContext, seedFixture, type Fixture } from "../integration/testDb";

// Verifies the deny-by-default RLS design documented in
// supabase/migrations/0010_passengers.sql: passengers has exactly one
// policy (is_office()), so dispatcher/driver selects return zero rows
// rather than an error — this is what actually restricts
// vulnerability_notes to Office/Admin (build spec §8), without needing
// column-level grants.

describe("passengers RLS", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("lets office read passengers, including vulnerability_notes", async () => {
    const rows = await withAuthContext(client, fixture.officeUserId, async () => {
      const { rows } = await client.query("select id, vulnerability_notes from passengers where id = $1", [
        fixture.passengerId,
      ]);
      return rows;
    });
    expect(rows).toHaveLength(1);
  });

  it("lets admin read passengers", async () => {
    const rows = await withAuthContext(client, fixture.adminUserId, async () => {
      const { rows } = await client.query("select id from passengers where id = $1", [fixture.passengerId]);
      return rows;
    });
    expect(rows).toHaveLength(1);
  });

  it("returns zero rows for dispatcher (RLS-filtered, not an error)", async () => {
    const rows = await withAuthContext(client, fixture.dispatcherUserId, async () => {
      const { rows } = await client.query("select id from passengers where id = $1", [fixture.passengerId]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("returns zero rows for driver (RLS-filtered, not an error)", async () => {
    const rows = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query("select id from passengers where id = $1", [fixture.passengerId]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});
