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

// Requires a real, migrated, disposable Postgres database — see testDb.ts
// and the Phase 1 plan's open decision #5. Run with `npm run test:integration`.
// Never point DATABASE_URL at the dev/seed database.

async function allocate(
  client: Client,
  args: {
    departureId: string;
    leadPassengerId: string;
    passengers: unknown[];
    overrideReason?: string | null;
  }
) {
  const { rows } = await client.query(
    `select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, $4, null, null) as result`,
    [args.departureId, args.leadPassengerId, JSON.stringify(args.passengers), args.overrideReason ?? null]
  );
  return rows[0].result as { booking_id: string; reference: string };
}

describe("allocate_booking_capacity", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("succeeds when selling exactly the released seats, fails on one more", async () => {
    const departureId = await seedDeparture(client, fixture, { seats_capacity: 2, seats_released: 2 });
    const passengers = [bookingPassengerPayload(fixture.passengerId), bookingPassengerPayload(fixture.passengerId)];

    await withAuthContext(client, fixture.officeUserId, () =>
      allocate(client, { departureId, leadPassengerId: fixture.passengerId, passengers })
    );

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        allocate(client, {
          departureId,
          leadPassengerId: fixture.passengerId,
          passengers: [bookingPassengerPayload(fixture.passengerId)],
        })
      )
    ).rejects.toThrow(/no_seats/);
  });

  it("excludes a non-seat-occupying infant from the seat check but counts them toward the crossing limit", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 1,
      seats_released: 1,
      crossing_passenger_limit: 1,
    });

    const adult = bookingPassengerPayload(fixture.passengerId, { category: "woman", occupies_seat: true });
    const infant = bookingPassengerPayload(fixture.passengerId, {
      category: "infant",
      occupies_seat: false,
      notional_fare: 0,
      contribution: 0,
    });

    // Both fit the single seat (infant doesn't consume one) but together
    // they exceed the crossing_passenger_limit of 1 (headcount, not seats).
    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        allocate(client, { departureId, leadPassengerId: fixture.passengerId, passengers: [adult, infant] })
      )
    ).rejects.toThrow(/crossing_limit_reached/);
  });

  it("enforces the hold capacity boundary, and lets an override bypass it", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 5,
      seats_released: 5,
      hold_capacity_units: 1,
    });
    const overLuggage = bookingPassengerPayload(fixture.passengerId, { luggage_units_consumed: 2 });

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        allocate(client, { departureId, leadPassengerId: fixture.passengerId, passengers: [overLuggage] })
      )
    ).rejects.toThrow(/no_hold_capacity/);

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        allocate(client, {
          departureId,
          leadPassengerId: fixture.passengerId,
          passengers: [overLuggage],
          overrideReason: "Office approved — extra suitcase, room on the day",
        })
      )
    ).resolves.toHaveProperty("booking_id");
  });

  it("enforces the wheelchair capacity boundary, and lets an override bypass it", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 5,
      seats_released: 5,
      wheelchair_capacity: 0,
    });
    const wheelchairUser = bookingPassengerPayload(fixture.passengerId, { wheelchair_space: true });

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        allocate(client, { departureId, leadPassengerId: fixture.passengerId, passengers: [wheelchairUser] })
      )
    ).rejects.toThrow(/no_wheelchair_space/);

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        allocate(client, {
          departureId,
          leadPassengerId: fixture.passengerId,
          passengers: [wheelchairUser],
          overrideReason: "Office approved",
        })
      )
    ).resolves.toHaveProperty("booking_id");
  });

  it("never lets an override bypass the seat limit or the crossing limit", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 1,
      seats_released: 1,
      crossing_passenger_limit: 1,
    });
    const two = [bookingPassengerPayload(fixture.passengerId), bookingPassengerPayload(fixture.passengerId)];

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        allocate(client, {
          departureId,
          leadPassengerId: fixture.passengerId,
          passengers: two,
          overrideReason: "Please just let two on",
        })
      )
    ).rejects.toThrow(/no_seats/);
  });

  it("enforces the unsecured provisional cap and never lets it be overridden", async () => {
    // app_settings.unsecured_provisional_cap_pct defaults to 30 (0002_app_settings.sql).
    // With 10 released seats, floor(10 * 30 / 100) = 3 unsecured slots allowed.
    const departureId = await seedDeparture(client, fixture, { seats_capacity: 10, seats_released: 10 });
    const threeProvisional = [
      bookingPassengerPayload(fixture.passengerId, { status: "provisional" }),
      bookingPassengerPayload(fixture.passengerId, { status: "provisional" }),
      bookingPassengerPayload(fixture.passengerId, { status: "provisional" }),
    ];
    await withAuthContext(client, fixture.officeUserId, () =>
      allocate(client, { departureId, leadPassengerId: fixture.passengerId, passengers: threeProvisional })
    );

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        allocate(client, {
          departureId,
          leadPassengerId: fixture.passengerId,
          passengers: [bookingPassengerPayload(fixture.passengerId, { status: "provisional" })],
          overrideReason: "Office approved",
        })
      )
    ).rejects.toThrow(/unsecured_cap_reached/);
  });

  it("rejects a direct insert whose contribution + sponsored + subsidy doesn't equal the notional fare", async () => {
    const departureId = await seedDeparture(client, fixture);
    const { rows: bookingRows } = await client.query(
      `insert into bookings (departure_id, lead_passenger_id, channel) values ($1, $2, 'office') returning id`,
      [departureId, fixture.passengerId]
    );

    await expect(
      client.query(
        `insert into booking_passengers (
           booking_id, passenger_id, category, currency, notional_fare, contribution, sponsored, subsidy
         ) values ($1, $2, 'man', 'GBP', 40, 10, 10, 10)`,
        [bookingRows[0].id, fixture.passengerId]
      )
    ).rejects.toThrow(/violates check constraint/);
  });
});

describe("allocate_trip_capacity", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("rolls back the outbound leg and the trip row when the return leg fails", async () => {
    const outboundId = await seedDeparture(client, fixture, { seats_capacity: 5, seats_released: 5 });
    const returnId = await seedDeparture(client, fixture, { seats_capacity: 0, seats_released: 0 });

    await expect(
      withAuthContext(client, fixture.officeUserId, async () => {
        const { rows } = await client.query(
          `select allocate_trip_capacity($1, $2::jsonb, $3::jsonb, null) as result`,
          [
            fixture.passengerId,
            JSON.stringify({
              departure_id: outboundId,
              channel: "phone",
              booking_passengers: [bookingPassengerPayload(fixture.passengerId)],
            }),
            JSON.stringify({
              departure_id: returnId,
              channel: "phone",
              booking_passengers: [bookingPassengerPayload(fixture.passengerId)],
            }),
          ]
        );
        return rows[0].result;
      })
    ).rejects.toThrow(/no_seats/);

    const { rows: bookings } = await client.query(
      "select count(*)::int as n from bookings where departure_id in ($1, $2)",
      [outboundId, returnId]
    );
    expect(bookings[0].n).toBe(0);

    const { rows: trips } = await client.query(
      "select count(*)::int as n from trips where lead_passenger_id = $1",
      [fixture.passengerId]
    );
    expect(trips[0].n).toBe(0);
  });
});

describe("allocate_booking_capacity concurrency", () => {
  let fixture: Fixture;
  let setupClient: Client;

  beforeAll(async () => {
    setupClient = await connectAsSuperuser();
    fixture = await seedFixture(setupClient);
  });

  afterAll(async () => {
    await setupClient.end();
  });

  it("lets only one of two simultaneous calls take the last seat", async () => {
    const departureId = await seedDeparture(setupClient, fixture, { seats_capacity: 1, seats_released: 1 });

    const clientA = await connectAsSuperuser();
    const clientB = await connectAsSuperuser();
    try {
      const callA = withAuthContext(clientA, fixture.officeUserId, () =>
        allocate(clientA, { departureId, leadPassengerId: fixture.passengerId, passengers: [bookingPassengerPayload(fixture.passengerId)] })
      );
      const callB = withAuthContext(clientB, fixture.officeUserId, () =>
        allocate(clientB, { departureId, leadPassengerId: fixture.passengerId, passengers: [bookingPassengerPayload(fixture.passengerId)] })
      );

      const results = await Promise.allSettled([callA, callB]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // The `select ... for update` lock in allocate_booking_capacity
      // serializes the two calls against the same departure row — exactly
      // one succeeds, the other sees the seat already taken.
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });
});
