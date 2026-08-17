import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "pg";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { join } from "path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  connectAsSuperuser,
  withAuthContext,
  seedFixture,
  seedDeparture,
  bookingPassengerPayload,
  type Fixture,
} from "./testDb";

config({ path: join(__dirname, "..", "..", ".env.local") });

// Build spec Phase 5 (§39): passenger self-service + referrer/sponsor
// portal. Unlike every other integration test file, several of these
// scenarios need a genuinely distinct auth.users identity per "passenger"
// (RLS ownership checks are keyed off auth.uid(), and passenger_account_
// users needs a real, unique auth.users row per link) — reusing the
// seeded staff accounts the way other test files do would mean
// temporarily linking a real dispatcher/driver login to the passenger
// portal, which is a residue risk even with cleanup. Real throwaway auth
// users are created via the admin client instead and deleted in
// afterAll (which cascades to passenger_account_users/
// organization_account_users via their own `on delete cascade`).

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function createThrowawayAuthUser(): Promise<{ id: string; email: string }> {
  const admin = adminClient();
  const email = `test-phase5-${randomUUID().slice(0, 8)}@shuttleops.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Test-${randomUUID()}`,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  return { id: data.user.id, email };
}

async function deleteThrowawayAuthUser(userId: string): Promise<void> {
  const admin = adminClient();
  await admin.auth.admin.deleteUser(userId);
}

describe("passenger self-service", () => {
  let client: Client;
  let fixture: Fixture;
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let passengerAId: string;
  let passengerBId: string;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
    userA = await createThrowawayAuthUser();
    userB = await createThrowawayAuthUser();
  });

  afterAll(async () => {
    // Deleting the auth users cascades to passenger_account_users/
    // passenger_saved_addresses, but bookings/trips/cancellations don't
    // cascade from passengers (same non-cascading-FK pattern documented in
    // scripts/clean-test-data.ts) — clean those up in dependency order
    // first. Also matches the "Test " prefix the periodic cleanup script
    // scans for, as a fallback if this afterAll never runs.
    await client.query(
      `delete from cancellations where booking_id in (
         select id from bookings where lead_passenger_id in (select id from passengers where full_name like 'Test Passenger Phase5 %')
       )`
    );
    await client.query(
      `delete from booking_passengers where booking_id in (
         select id from bookings where lead_passenger_id in (select id from passengers where full_name like 'Test Passenger Phase5 %')
       )`
    );
    // trips.outbound_booking_id/return_booking_id reference bookings — the
    // trips row itself must go before the bookings it points at, not after.
    await client.query(
      `delete from trips where lead_passenger_id in (select id from passengers where full_name like 'Test Passenger Phase5 %')`
    );
    await client.query(
      `delete from bookings where lead_passenger_id in (select id from passengers where full_name like 'Test Passenger Phase5 %')`
    );
    await client.query(`delete from passengers where full_name like 'Test Passenger Phase5 %'`);
    await deleteThrowawayAuthUser(userA.id);
    await deleteThrowawayAuthUser(userB.id);
    await client.end();
  });

  it("signup_passenger_account creates a passenger and links it to the caller", async () => {
    passengerAId = await withAuthContext(client, userA.id, async () => {
      const { rows } = await client.query(`select signup_passenger_account($1, $2, $3, $4) as id`, [
        "Test Passenger Phase5 A",
        "07700900001",
        userA.email,
        "en",
      ]);
      return rows[0].id;
    });
    expect(passengerAId).toBeDefined();

    const { rows } = await client.query(`select full_name, created_via from passengers where id = $1`, [
      passengerAId,
    ]);
    expect(rows[0]).toMatchObject({ full_name: "Test Passenger Phase5 A", created_via: "online" });
  });

  it("signup_passenger_account rejects a second signup for an already-linked user", async () => {
    await expect(
      withAuthContext(client, userA.id, () =>
        client.query(`select signup_passenger_account($1) as id`, ["Test Passenger Phase5 A Again"])
      )
    ).rejects.toThrow(/already_linked/);
  });

  it("sets up a second passenger for cross-passenger isolation checks", async () => {
    passengerBId = await withAuthContext(client, userB.id, async () => {
      const { rows } = await client.query(`select signup_passenger_account($1, $2, $3, $4) as id`, [
        "Test Passenger Phase5 B",
        "07700900002",
        userB.email,
        "nl",
      ]);
      return rows[0].id;
    });
    expect(passengerBId).toBeDefined();
    expect(passengerBId).not.toBe(passengerAId);
  });

  it("get_my_passenger_profile returns only the caller's own row, excluding vulnerability_notes", async () => {
    await client.query(`update passengers set vulnerability_notes = 'sensitive office note', is_vulnerable = true where id = $1`, [
      passengerAId,
    ]);

    const profile = await withAuthContext(client, userA.id, async () => {
      const { rows } = await client.query(`select * from get_my_passenger_profile()`);
      return rows[0];
    });
    expect(profile.id).toBe(passengerAId);
    expect(profile.full_name).toBe("Test Passenger Phase5 A");
    expect(profile.vulnerability_notes).toBeUndefined();
    expect(profile.is_vulnerable).toBeUndefined();
  });

  it("create_online_trip_booking succeeds for a passenger booking for themselves", async () => {
    const departureId = await seedDeparture(client, fixture, { seats_capacity: 4, seats_released: 4 });

    const result = await withAuthContext(client, userA.id, async () => {
      const { rows } = await client.query(`select create_online_trip_booking($1::jsonb, null) as result`, [
        JSON.stringify({
          departure_id: departureId,
          booking_passengers: [bookingPassengerPayload(passengerAId, { status: "provisional" })],
        }),
      ]);
      return rows[0].result;
    });

    expect(result.trip_id).toBeDefined();
    expect(result.outbound.booking_id).toBeDefined();

    const { rows: bookingRows } = await client.query(
      `select channel, lead_passenger_id from bookings where id = $1`,
      [result.outbound.booking_id]
    );
    expect(bookingRows[0]).toMatchObject({ channel: "online", lead_passenger_id: passengerAId });
  });

  it("create_online_trip_booking fails for a user with no linked passenger", async () => {
    const departureId = await seedDeparture(client, fixture);
    const stranger = await createThrowawayAuthUser();
    try {
      await expect(
        withAuthContext(client, stranger.id, () =>
          client.query(`select create_online_trip_booking($1::jsonb, null) as result`, [
            JSON.stringify({
              departure_id: departureId,
              booking_passengers: [bookingPassengerPayload(passengerAId, { status: "provisional" })],
            }),
          ])
        )
      ).rejects.toThrow(/not_linked/);
    } finally {
      await deleteThrowawayAuthUser(stranger.id);
    }
  });

  it("allocate_booking_capacity rejects an online booking that tries to book for a DIFFERENT passenger", async () => {
    const departureId = await seedDeparture(client, fixture);
    await expect(
      withAuthContext(client, userA.id, () =>
        client.query(
          `select allocate_booking_capacity($1, $2, 'online', $3::jsonb, null, null, null, null) as result`,
          [
            departureId,
            passengerBId, // not userA's own passenger
            JSON.stringify([bookingPassengerPayload(passengerBId, { status: "provisional" })]),
          ]
        )
      )
    ).rejects.toThrow(/not_authorized/);
  });

  it("allocate_booking_capacity rejects an online booking with an override reason", async () => {
    const departureId = await seedDeparture(client, fixture);
    await expect(
      withAuthContext(client, userA.id, () =>
        client.query(
          `select allocate_booking_capacity($1, $2, 'online', $3::jsonb, null, $4, null, null) as result`,
          [
            departureId,
            passengerAId,
            JSON.stringify([bookingPassengerPayload(passengerAId, { status: "provisional" })]),
            "trying to sneak past a limit",
          ]
        )
      )
    ).rejects.toThrow(/not_authorized/);
  });

  it("allocate_booking_capacity rejects an online booking claiming to be booked_by_user_id someone else", async () => {
    const departureId = await seedDeparture(client, fixture);
    await expect(
      withAuthContext(client, userA.id, () =>
        client.query(
          `select allocate_booking_capacity($1, $2, 'online', $3::jsonb, null, null, $4, null) as result`,
          [
            departureId,
            passengerAId,
            JSON.stringify([bookingPassengerPayload(passengerAId, { status: "provisional" })]),
            fixture.officeUserId,
          ]
        )
      )
    ).rejects.toThrow(/not_authorized/);
  });

  it("Office can still book normally — the broadened auth check doesn't regress the staff path", async () => {
    const departureId = await seedDeparture(client, fixture);
    const result = await withAuthContext(client, fixture.officeUserId, async () => {
      const { rows } = await client.query(
        `select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`,
        [
          departureId,
          fixture.passengerId,
          JSON.stringify([bookingPassengerPayload(fixture.passengerId, { status: "confirmed" })]),
        ]
      );
      return rows[0].result;
    });
    expect(result.booking_id).toBeDefined();
  });

  it("list_my_bookings only returns the caller's own bookings, never another passenger's", async () => {
    const bookingsForA = await withAuthContext(client, userA.id, async () => {
      const { rows } = await client.query(`select * from list_my_bookings()`);
      return rows;
    });
    expect(bookingsForA.length).toBeGreaterThan(0);
    expect(bookingsForA.every((b: { booking_passenger_id: string }) => !!b.booking_passenger_id)).toBe(true);

    const bookingsForB = await withAuthContext(client, userB.id, async () => {
      const { rows } = await client.query(`select * from list_my_bookings()`);
      return rows;
    });
    expect(bookingsForB.length).toBe(0);
  });

  it("passenger_saved_addresses RLS: a passenger can only see their own saved addresses", async () => {
    const { rows: addressRows } = await client.query(
      `insert into addresses (line1, postcode, country) values ($1, $2, 'GB') returning id`,
      [`Test Address Phase5 ${randomUUID().slice(0, 8)}`, "N1 1AA"]
    );
    const addressId = addressRows[0].id;

    await withAuthContext(client, userA.id, () =>
      client.query(`insert into passenger_saved_addresses (passenger_id, address_id, label) values ($1, $2, 'Home')`, [
        passengerAId,
        addressId,
      ])
    );

    const seenByA = await withAuthContext(client, userA.id, async () => {
      const { rows } = await client.query(`select * from passenger_saved_addresses where passenger_id = $1`, [
        passengerAId,
      ]);
      return rows;
    });
    expect(seenByA.length).toBe(1);

    const seenByB = await withAuthContext(client, userB.id, async () => {
      const { rows } = await client.query(`select * from passenger_saved_addresses where passenger_id = $1`, [
        passengerAId,
      ]);
      return rows;
    });
    expect(seenByB.length).toBe(0);

    await expect(
      withAuthContext(client, userB.id, () =>
        client.query(`insert into passenger_saved_addresses (passenger_id, address_id, label) values ($1, $2, 'Sneaky')`, [
          passengerAId, // userB trying to insert a row for userA's passenger
          addressId,
        ])
      )
    ).rejects.toThrow();
  });

  it("cancellations RLS: a passenger can request cancellation of their own booking but not decide it", async () => {
    const departureId = await seedDeparture(client, fixture, { seats_capacity: 4, seats_released: 4 });
    const bookingId = await withAuthContext(client, userA.id, async () => {
      const { rows } = await client.query(`select create_online_trip_booking($1::jsonb, null) as result`, [
        JSON.stringify({
          departure_id: departureId,
          booking_passengers: [bookingPassengerPayload(passengerAId, { status: "provisional" })],
        }),
      ]);
      return rows[0].result.outbound.booking_id;
    });

    const cancellationId = await withAuthContext(client, userA.id, async () => {
      const { rows } = await client.query(`select request_cancellation_online($1, $2) as id`, [
        bookingId,
        "change of plans",
      ]);
      return rows[0].id;
    });
    expect(cancellationId).toBeDefined();

    const { rows: rawRows } = await client.query(`select requested_via, decided_outcome from cancellations where id = $1`, [
      cancellationId,
    ]);
    expect(rawRows[0]).toMatchObject({ requested_via: "online", decided_outcome: null });

    // userB cannot request a cancellation on userA's booking — they don't
    // own it.
    await expect(
      withAuthContext(client, userB.id, () => client.query(`select request_cancellation_online($1, $2) as id`, [bookingId, "not mine"]))
    ).rejects.toThrow(/not_authorized/);

    // userA sees their own request via the curated list function; userB
    // sees none for this booking.
    const seenByA = await withAuthContext(client, userA.id, async () => {
      const { rows } = await client.query(`select * from list_my_cancellation_requests()`);
      return rows;
    });
    expect(seenByA.some((r: { id: string }) => r.id === cancellationId)).toBe(true);

    const seenByB = await withAuthContext(client, userB.id, async () => {
      const { rows } = await client.query(`select * from list_my_cancellation_requests()`);
      return rows;
    });
    expect(seenByB.some((r: { id: string }) => r.id === cancellationId)).toBe(false);
  });
});

describe("list_public_departures / get_public_departure_availability", () => {
  let client: Client;
  let fixture: Fixture;

  beforeAll(async () => {
    client = await connectAsSuperuser();
    fixture = await seedFixture(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("reflects real booking_passengers usage even for a caller with no RLS access to that table", async () => {
    const departureId = await seedDeparture(client, fixture, {
      seats_capacity: 4,
      seats_released: 4,
      hold_capacity_units: 10,
    });
    await client.query(`update departures set status = 'published' where id = $1`, [departureId]);

    await withAuthContext(client, fixture.officeUserId, () =>
      client.query(`select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`, [
        departureId,
        fixture.passengerId,
        JSON.stringify([bookingPassengerPayload(fixture.passengerId, { status: "confirmed" })]),
      ])
    );

    // anon has zero RLS access to booking_passengers, but this function is
    // security definer and must still report the real number — not 0.
    const anon = await createThrowawayAuthUser();
    try {
      const availability = await withAuthContext(client, anon.id, async () => {
        const { rows } = await client.query(`select * from get_public_departure_availability($1)`, [departureId]);
        return rows[0];
      });
      expect(availability.seats_available).toBe(3);
    } finally {
      await deleteThrowawayAuthUser(anon.id);
    }
  });

  it("never includes a draft departure", async () => {
    const departureId = await seedDeparture(client, fixture);
    await client.query(`update departures set status = 'draft' where id = $1`, [departureId]);

    const anon = await createThrowawayAuthUser();
    try {
      const found = await withAuthContext(client, anon.id, async () => {
        const { rows } = await client.query(`select * from list_public_departures(200)`);
        return rows.find((r: { departure_id: string }) => r.departure_id === departureId);
      });
      expect(found).toBeUndefined();
    } finally {
      await deleteThrowawayAuthUser(anon.id);
    }
  });
});

describe("referrer/sponsor portal", () => {
  let client: Client;
  let referrerUser: { id: string; email: string };
  let otherReferrerUser: { id: string; email: string };
  let sponsorUser: { id: string; email: string };
  let referrerOrgId: string;
  let otherReferrerOrgId: string;
  let sponsorOrgId: string;

  beforeAll(async () => {
    client = await connectAsSuperuser();

    const { rows: orgRows } = await client.query(
      `insert into organizations (name, org_type) values
         ($1, 'referrer'), ($2, 'referrer'), ($3, 'sponsor')
       returning id, org_type`,
      [
        `Test Referrer Org Phase5 ${randomUUID().slice(0, 8)}`,
        `Test Referrer Org Phase5 Other ${randomUUID().slice(0, 8)}`,
        `Test Sponsor Org Phase5 ${randomUUID().slice(0, 8)}`,
      ]
    );
    referrerOrgId = orgRows[0].id;
    otherReferrerOrgId = orgRows[1].id;
    sponsorOrgId = orgRows[2].id;

    referrerUser = await createThrowawayAuthUser();
    otherReferrerUser = await createThrowawayAuthUser();
    sponsorUser = await createThrowawayAuthUser();

    await client.query(
      `insert into organization_account_users (organization_id, user_id) values ($1, $2), ($3, $4), ($5, $6)`,
      [referrerOrgId, referrerUser.id, otherReferrerOrgId, otherReferrerUser.id, sponsorOrgId, sponsorUser.id]
    );
  });

  afterAll(async () => {
    await client.query(`delete from passengers where full_name like 'Test Passenger Phase5 Referred%'`);
    // The sponsored-bookings test creates a real booking_passengers row
    // referencing sponsorOrgId (via a fresh seedFixture() departure/
    // passenger, cleaned up separately by the periodic db:clean-test-data
    // sweep) — decouple that reference before deleting the organization
    // itself, rather than hunting down and deleting that specific booking
    // here too.
    await client.query(
      `update booking_passengers set sponsor_org_id = null where sponsor_org_id in (
         select id from organizations where name like 'Test Referrer Org Phase5%' or name like 'Test Sponsor Org Phase5%'
       )`
    );
    await client.query(`delete from organizations where name like 'Test Referrer Org Phase5%' or name like 'Test Sponsor Org Phase5%'`);
    await deleteThrowawayAuthUser(referrerUser.id);
    await deleteThrowawayAuthUser(otherReferrerUser.id);
    await deleteThrowawayAuthUser(sponsorUser.id);
    await client.end();
  });

  it("refer_passenger creates a passenger with referrer_org_id forced to the caller's own org", async () => {
    const passengerId = await withAuthContext(client, referrerUser.id, async () => {
      // refer_passenger(p_full_name, p_phone, p_email, p_category, p_preferred_language)
      const { rows } = await client.query(`select refer_passenger($1, $2, $3, $4, $5) as id`, [
        "Test Passenger Phase5 Referred A",
        "07700900010",
        null,
        "man",
        null,
      ]);
      return rows[0].id;
    });

    const { rows } = await client.query(`select referrer_org_id, created_via from passengers where id = $1`, [
      passengerId,
    ]);
    expect(rows[0]).toMatchObject({ referrer_org_id: referrerOrgId, created_via: "referrer" });
  });

  it("refer_passenger rejects a sponsor-type org (only referrer-type orgs may refer)", async () => {
    await expect(
      withAuthContext(client, sponsorUser.id, () =>
        client.query(`select refer_passenger($1) as id`, ["Test Passenger Phase5 Referred B"])
      )
    ).rejects.toThrow(/not_a_referrer/);
  });

  it("list_my_referred_passengers only shows passengers referred by the caller's own org", async () => {
    const seenByReferrer = await withAuthContext(client, referrerUser.id, async () => {
      const { rows } = await client.query(`select * from list_my_referred_passengers()`);
      return rows;
    });
    expect(seenByReferrer.some((p: { full_name: string }) => p.full_name === "Test Passenger Phase5 Referred A")).toBe(
      true
    );

    const seenByOtherReferrer = await withAuthContext(client, otherReferrerUser.id, async () => {
      const { rows } = await client.query(`select * from list_my_referred_passengers()`);
      return rows;
    });
    expect(
      seenByOtherReferrer.some((p: { full_name: string }) => p.full_name === "Test Passenger Phase5 Referred A")
    ).toBe(false);
  });

  it("list_my_sponsored_bookings withholds passenger identity and only shows the caller's own org's sponsorships", async () => {
    const fixture = await seedFixture(client);
    const departureId = await seedDeparture(client, fixture, { seats_capacity: 4, seats_released: 4 });

    await withAuthContext(client, fixture.officeUserId, () =>
      client.query(`select allocate_booking_capacity($1, $2, 'phone', $3::jsonb, null, null, null, null) as result`, [
        departureId,
        fixture.passengerId,
        JSON.stringify([
          bookingPassengerPayload(fixture.passengerId, {
            status: "confirmed",
            sponsor_org_id: sponsorOrgId,
            // notional_fare defaults to 40 (bookingPassengerPayload) — must
            // still satisfy notional_fare = contribution + sponsored + subsidy.
            contribution: 15,
            sponsored: 25,
          }),
        ]),
      ])
    );

    const seenBySponsor = await withAuthContext(client, sponsorUser.id, async () => {
      const { rows } = await client.query(`select * from list_my_sponsored_bookings()`);
      return rows;
    });
    expect(seenBySponsor.length).toBeGreaterThan(0);
    expect(seenBySponsor[0]).not.toHaveProperty("full_name");
    expect(seenBySponsor[0]).not.toHaveProperty("phone");
    expect(Number(seenBySponsor[0].sponsored)).toBe(25);

    const seenByReferrer = await withAuthContext(client, referrerUser.id, async () => {
      const { rows } = await client.query(`select * from list_my_sponsored_bookings()`);
      return rows;
    });
    expect(seenByReferrer.length).toBe(0);
  });
});
