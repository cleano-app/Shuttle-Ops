import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "pg";
import {
  connectAsSuperuser,
  withAuthContext,
  seedFixture,
  seedDeparture,
  bookingPassengerPayload,
  type Fixture,
} from "./testDb";

describe("departure_has_unreconciled_cash", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  // Build spec §26: "Unreconciled cash blocks a departure from reaching
  // completed." transitionDepartureStatus() (src/app/actions/
  // departures.ts) calls this function before allowing a move to
  // 'completed' — these tests pin the SQL-level contract it relies on.

  it("returns false when a departure has no cash transactions at all", async () => {
    const departureId = await seedDeparture(client, fixture);
    const { rows } = await client.query("select departure_has_unreconciled_cash($1) as result", [departureId]);
    expect(rows[0].result).toBe(false);
  });

  it("returns true once an unreconciled cash transaction is recorded", async () => {
    const departureId = await seedDeparture(client, fixture);
    await client.query(
      `insert into cash_transactions (driver_id, departure_id, transaction_type, currency, amount)
       values ($1, $2, 'passenger_contribution', 'GBP', 20)`,
      [fixture.driverUserId, departureId]
    );

    const { rows } = await client.query("select departure_has_unreconciled_cash($1) as result", [departureId]);
    expect(rows[0].result).toBe(true);
  });

  it("returns false again once every transaction on the departure is reconciled", async () => {
    const departureId = await seedDeparture(client, fixture);
    const { rows: txRows } = await client.query(
      `insert into cash_transactions (driver_id, departure_id, transaction_type, currency, amount)
       values ($1, $2, 'passenger_contribution', 'GBP', 20) returning id`,
      [fixture.driverUserId, departureId]
    );

    await client.query(
      `update cash_transactions set reconciled_by = $1, reconciled_at = now() where id = $2`,
      [fixture.officeUserId, txRows[0].id]
    );

    const { rows } = await client.query("select departure_has_unreconciled_cash($1) as result", [departureId]);
    expect(rows[0].result).toBe(false);
  });

  it("stays true when only SOME transactions on the departure are reconciled", async () => {
    const departureId = await seedDeparture(client, fixture);
    const { rows: txRows } = await client.query(
      `insert into cash_transactions (driver_id, departure_id, transaction_type, currency, amount)
       values ($1, $2, 'passenger_contribution', 'GBP', 20), ($1, $2, 'deposit', 'GBP', 10)
       returning id`,
      [fixture.driverUserId, departureId]
    );

    await client.query(
      `update cash_transactions set reconciled_by = $1, reconciled_at = now() where id = $2`,
      [fixture.officeUserId, txRows[0].id]
    );

    const { rows } = await client.query("select departure_has_unreconciled_cash($1) as result", [departureId]);
    expect(rows[0].result).toBe(true);
  });

  it("scopes to the given departure — cash on a different departure doesn't block this one", async () => {
    const departureA = await seedDeparture(client, fixture);
    const departureB = await seedDeparture(client, fixture);
    await client.query(
      `insert into cash_transactions (driver_id, departure_id, transaction_type, currency, amount)
       values ($1, $2, 'passenger_contribution', 'GBP', 20)`,
      [fixture.driverUserId, departureB]
    );

    const { rows } = await client.query("select departure_has_unreconciled_cash($1) as result", [departureA]);
    expect(rows[0].result).toBe(false);
  });

  it("is exposed to Office/Admin via RPC (grant execute), same as any authenticated role check", async () => {
    const departureId = await seedDeparture(client, fixture);
    const result = await withAuthContext(client, fixture.officeUserId, async () => {
      const { rows } = await client.query("select departure_has_unreconciled_cash($1) as result", [departureId]);
      return rows[0].result;
    });
    expect(result).toBe(false);
  });
});

describe("departure_capacity_summary feeding waitlist offer decisions", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  // src/app/actions/waitlist.ts's offerNextWaiting() reads this view once
  // and hands it to pickNextWaitlistOffer() (unit-tested separately in
  // src/lib/waitlist/pickNextOffer.test.ts). This test pins the view's
  // arithmetic itself — the SQL-level contract that TS logic assumes is
  // correct.

  it("reflects confirmed bookings' seat/hold/wheelchair usage, excluding cancelled ones", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 4,
      seats_released: 4,
      hold_capacity_units: 10,
      wheelchair_capacity: 1,
    });

    await withAuthContext(client, fixture.officeUserId, () =>
      client.query(`select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`, [
        departureId,
        fixture.passengerId,
        JSON.stringify([
          bookingPassengerPayload(fixture.passengerId, {
            status: "confirmed",
            luggage_units_consumed: 3,
            wheelchair_space: true,
          }),
        ]),
      ])
    );

    // A second, cancelled booking should NOT count toward usage.
    await withAuthContext(client, fixture.officeUserId, async () => {
      const { rows } = await client.query(
        `select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`,
        [
          departureId,
          fixture.passengerId,
          JSON.stringify([bookingPassengerPayload(fixture.passengerId, { status: "provisional" })]),
        ]
      );
      const bookingId = (rows[0].result as { booking_id: string }).booking_id;
      await client.query("update bookings set status = 'cancelled' where id = $1", [bookingId]);
      await client.query("update booking_passengers set status = 'cancelled' where booking_id = $1", [bookingId]);
    });

    const { rows } = await client.query(
      `select seats_used, hold_used, wheelchair_used from departure_capacity_summary where departure_id = $1`,
      [departureId]
    );
    expect(rows[0]).toMatchObject({ seats_used: 1, hold_used: 3, wheelchair_used: 1 });
  });
});

describe("disruption re-accommodation's underlying capacity guarantee", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  // src/app/actions/disruption.ts's reaccommodateDeparture() moves every
  // passenger on a disrupted departure to a target departure via one
  // allocate_booking_capacity() call per original booking — there is no
  // separate "disruption bypass". These tests pin that a full target
  // departure genuinely rejects the move (driving disruption.ts's
  // waitlist-fallback branch) and that a target with room accepts it.

  it("rejects a re-accommodation-shaped move onto a target departure with no seats left", async () => {
    const targetId = await seedDeparture(client, fixture, { seats_capacity: 1, seats_released: 1 });

    // Fill the target's only seat first.
    await withAuthContext(client, fixture.officeUserId, () =>
      client.query(`select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`, [
        targetId,
        fixture.passengerId,
        JSON.stringify([bookingPassengerPayload(fixture.passengerId, { status: "confirmed" })]),
      ])
    );

    // Simulates one moved booking with 2 passengers, exactly what
    // reaccommodateDeparture() would send for a disrupted booking.
    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        client.query(`select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`, [
          targetId,
          fixture.passengerId,
          JSON.stringify([
            bookingPassengerPayload(fixture.passengerId, { status: "confirmed" }),
            bookingPassengerPayload(fixture.passengerId, { status: "confirmed" }),
          ]),
        ])
      )
    ).rejects.toThrow(/no_seats/);
  });

  it("accepts the same shaped move onto a target departure with enough room", async () => {
    const targetId = await seedDeparture(client, fixture, { seats_capacity: 4, seats_released: 4 });

    const result = await withAuthContext(client, fixture.officeUserId, async () => {
      const { rows } = await client.query(
        `select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`,
        [
          targetId,
          fixture.passengerId,
          JSON.stringify([
            bookingPassengerPayload(fixture.passengerId, { status: "confirmed" }),
            bookingPassengerPayload(fixture.passengerId, { status: "confirmed" }),
          ]),
        ]
      );
      return rows[0].result;
    });
    expect(result).toBeDefined();

    const { rows: summaryRows } = await client.query(
      `select seats_used from departure_capacity_summary where departure_id = $1`,
      [targetId]
    );
    expect(summaryRows[0].seats_used).toBe(2);
  });
});
