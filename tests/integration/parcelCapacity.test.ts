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

// Verifies build spec §15: "Parcels share physical hold capacity with
// passenger luggage." allocate_parcel_capacity() and
// allocate_booking_capacity() must each count the OTHER's usage when
// checking the shared hold_capacity_units pool (0037's actual change from
// the Phase 1/2 no-op).

function parcelPayload(overrides: Record<string, unknown> = {}) {
  return {
    sender_name: "Sender",
    recipient_name: "Recipient",
    size_category: "medium",
    units_consumed: 1,
    prohibited_items_declared: true,
    price: 10,
    currency: "GBP",
    ...overrides,
  };
}

describe("parcel/luggage shared hold capacity", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("a parcel booking is rejected when passenger luggage already fills the hold", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 5,
      seats_released: 5,
      hold_capacity_units: 2,
    });

    // Fill the 2-unit hold with a confirmed passenger's luggage first.
    await withAuthContext(client, fixture.officeUserId, async () => {
      const { rows } = await client.query(
        `select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`,
        [
          departureId,
          fixture.passengerId,
          JSON.stringify([bookingPassengerPayload(fixture.passengerId, { status: "confirmed", luggage_units_consumed: 2 })]),
        ]
      );
      return rows[0].result;
    });

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        client.query(`select allocate_parcel_capacity($1, $2::jsonb, null) as result`, [
          departureId,
          JSON.stringify(parcelPayload()),
        ])
      )
    ).rejects.toThrow(/no_hold_capacity/);
  });

  it("passenger luggage booking is rejected when an existing parcel already fills the hold", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 5,
      seats_released: 5,
      hold_capacity_units: 1,
    });

    await withAuthContext(client, fixture.officeUserId, () =>
      client.query(`select allocate_parcel_capacity($1, $2::jsonb, null) as result`, [
        departureId,
        JSON.stringify(parcelPayload({ units_consumed: 1 })),
      ])
    );

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        client.query(`select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`, [
          departureId,
          fixture.passengerId,
          JSON.stringify([bookingPassengerPayload(fixture.passengerId, { status: "confirmed", luggage_units_consumed: 1 })]),
        ])
      )
    ).rejects.toThrow(/no_hold_capacity/);
  });

  it("an override reason bypasses the shared hold-capacity check for a parcel, same as luggage", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 5,
      seats_released: 5,
      hold_capacity_units: 0,
    });

    await expect(
      withAuthContext(client, fixture.officeUserId, () =>
        client.query(`select allocate_parcel_capacity($1, $2::jsonb, $3) as result`, [
          departureId,
          JSON.stringify(parcelPayload()),
          "Office approved — room on the roof rack",
        ])
      )
    ).resolves.toBeDefined();
  });

  it("rejects a parcel booking with prohibited_items_declared = false at the table level", async () => {
    const departureId = await seedDeparture(client, fixture);
    await expect(
      client.query(
        `insert into parcels (departure_id, sender_name, recipient_name, size_category, prohibited_items_declared, currency)
         values ($1, 'S', 'R', 'small', false, 'GBP')`,
        [departureId]
      )
    ).rejects.toThrow(/violates check constraint/);
  });
});
