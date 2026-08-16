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

// Same deny-by-default design as passengers (0015_booking_passengers.sql):
// no dispatcher/driver policy exists at all — a driver-scoped manifest read
// is deferred to Phase 2 once departures gain an assignment column to
// scope against (see the migration's own comment).

describe("booking_passengers RLS", () => {
  let client: Client;
  let fixture: Fixture;
  let bookingPassengerId: string;

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
    bookingPassengerId = bpRows[0].id;
  });

  afterAll(async () => {
    await client.end();
  });

  it("lets office read booking_passengers", async () => {
    const rows = await withAuthContext(client, fixture.officeUserId, async () => {
      const { rows } = await client.query("select id from booking_passengers where id = $1", [bookingPassengerId]);
      return rows;
    });
    expect(rows).toHaveLength(1);
  });

  it("returns zero rows for dispatcher", async () => {
    const rows = await withAuthContext(client, fixture.dispatcherUserId, async () => {
      const { rows } = await client.query("select id from booking_passengers where id = $1", [bookingPassengerId]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("returns zero rows for driver — no fares, deposits or manifest access in Phase 1", async () => {
    const rows = await withAuthContext(client, fixture.driverUserId, async () => {
      const { rows } = await client.query("select id from booking_passengers where id = $1", [bookingPassengerId]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});
