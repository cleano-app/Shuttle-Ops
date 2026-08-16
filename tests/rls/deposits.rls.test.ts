import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "pg";
import {
  connectAsSuperuser,
  withAuthContext,
  seedFixture,
  seedDeparture,
  bookingPassengerPayload,
  type Fixture,
} from "../integration/testDb";

// deposits_office_manage (0017_deposits.sql) is Office/Admin only — a
// driver or dispatcher must never see deposit amounts or status (build
// spec §4: "Drivers never see vulnerability notes, fares, deposits or the
// wider passenger database.").

describe("deposits RLS", () => {
  let client: Client;
  let fixture: Fixture;
  let depositId: string;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
    const departureId = await seedDeparture(client, fixture);
    const { rows: bookingRows } = await client.query(
      `insert into bookings (departure_id, lead_passenger_id, channel) values ($1, $2, 'office') returning id`,
      [departureId, fixture.passengerId]
    );
    const payload = bookingPassengerPayload(fixture.passengerId);
    const { rows: bpRows } = await client.query(
      `insert into booking_passengers (
         booking_id, passenger_id, category, currency, notional_fare, contribution, sponsored, subsidy
       ) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        bookingRows[0].id,
        payload.passenger_id,
        payload.category,
        payload.currency,
        payload.notional_fare,
        payload.contribution,
        payload.sponsored,
        payload.subsidy,
      ]
    );
    const { rows: depositRows } = await client.query(
      `insert into deposits (booking_passenger_id, amount, currency, status) values ($1, 20, 'GBP', 'required') returning id`,
      [bpRows[0].id]
    );
    depositId = depositRows[0].id;
  });

  afterAll(async () => {
    await client.end();
  });

  it("lets office read and update deposits", async () => {
    const rows = await withAuthContext(client, fixture.officeUserId, async () => {
      const { rows } = await client.query("select id, amount from deposits where id = $1", [depositId]);
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(20);
  });

  it("returns zero rows for dispatcher", async () => {
    const rows = await withAuthContext(client, fixture.dispatcherUserId, async () => {
      const { rows } = await client.query("select id from deposits where id = $1", [depositId]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("returns zero rows for driver", async () => {
    const rows = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query("select id from deposits where id = $1", [depositId]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});
