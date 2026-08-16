import { Client } from "pg";
import { config } from "dotenv";
import { join } from "path";
import { randomUUID } from "crypto";

config({ path: join(__dirname, "..", "..", ".env.local") });

/**
 * Shared connection + fixture helpers for the DB integration and RLS
 * suites (Phase 1 plan §6/§8 open decision #5) — new to Shuttle Ops, no
 * Cleano Ops equivalent exists. Requires a real Postgres connection with
 * every migration in supabase/migrations already applied.
 *
 * NEVER point this at the dev/seed database — these tests insert real rows
 * and, for the RLS suite, switch the connection to the `authenticated`
 * role. Use a disposable test database or a second scratch Supabase
 * project (see the Phase 1 plan's open decision #5).
 */
export function getConnectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "").replace(
    ".supabase.co",
    ""
  );
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!projectRef || !password) {
    throw new Error(
      "Set DATABASE_URL (preferred: a disposable test database) or " +
        "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD in .env.local before " +
        "running the integration/RLS suite."
    );
  }
  const poolerHost = process.env.SUPABASE_POOLER_HOST ?? "aws-1-eu-west-2.pooler.supabase.com";
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${poolerHost}:6543/postgres`;
}

export async function connectAsSuperuser(): Promise<Client> {
  const client = new Client({ connectionString: getConnectionString() });
  await client.connect();
  return client;
}

/**
 * Simulates a specific logged-in user for RLS purposes on an otherwise
 * superuser connection. Mirrors what Supabase's PostgREST layer actually
 * does per-request: it sets the `request.jwt.claim.sub` GUC (which
 * Supabase's `auth.uid()` reads — `select nullif(current_setting(
 * 'request.jwt.claim.sub', true), '')::uuid`) and switches to the
 * `authenticated` role before running the query, then resets both after.
 * Verify this still matches the target project's actual `auth.uid()`
 * definition once a real Supabase project exists — Supabase has changed
 * this GUC name across versions before.
 */
export async function withAuthContext<T>(
  client: Client,
  userId: string | null,
  fn: () => Promise<T>
): Promise<T> {
  await client.query("begin");
  try {
    if (userId) {
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await client.query("set local role authenticated");
    } else {
      await client.query("select set_config('request.jwt.claim.sub', '', true)");
      await client.query("set local role anon");
    }
    const result = await fn();
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

export interface Fixture {
  areaId: string;
  routeId: string;
  vehicleId: string;
  adminUserId: string;
  officeUserId: string;
  dispatcherUserId: string;
  driverUserId: string;
  passengerId: string;
}

/**
 * Minimal scaffold shared by most tests: one area/route/vehicle, one real
 * user per staff role, pulled from the accounts `npm run db:seed` already
 * created — NOT fabricated UUIDs. profiles.id has a hard FK to
 * auth.users(id) (0001_profiles.sql), so inserting a profiles row with a
 * made-up UUID fails with a foreign-key violation on any project where
 * that constraint is actually enforced (confirmed against the real
 * project). Reusing the seeded dev accounts sidesteps needing this test
 * suite to also drive supabase.auth.admin.createUser() itself.
 */
export async function seedFixture(client: Client): Promise<Fixture> {
  const { rows: profileRows } = await client.query<{ id: string; role: string }>(
    "select id, role from profiles where role in ('admin', 'office', 'dispatcher', 'driver')"
  );
  const byRole: Record<string, string> = {};
  for (const row of profileRows) {
    if (!byRole[row.role]) byRole[row.role] = row.id;
  }
  for (const role of ["admin", "office", "dispatcher", "driver"]) {
    if (!byRole[role]) {
      throw new Error(
        `No seeded '${role}' profile found. Run \`npm run db:seed\` against this database before the integration/RLS suite.`
      );
    }
  }
  const adminUserId = byRole.admin;
  const officeUserId = byRole.office;
  const dispatcherUserId = byRole.dispatcher;
  const driverUserId = byRole.driver;

  const { rows: areaRows } = await client.query(
    "insert into areas (name, country) values ($1, $2) returning id",
    [`Test Area ${randomUUID().slice(0, 8)}`, "GB"]
  );
  const areaId = areaRows[0].id;

  const { rows: routeRows } = await client.query(
    "insert into routes (name, origin_area_id, destination_area_id) values ($1, $2, $2) returning id",
    [`Test Route ${randomUUID().slice(0, 8)}`, areaId]
  );
  const routeId = routeRows[0].id;

  const { rows: vehicleRows } = await client.query(
    "insert into vehicles (registration, seat_capacity, hold_capacity_units, wheelchair_capacity) values ($1, 16, 26, 2) returning id",
    [`TEST-${randomUUID().slice(0, 8).toUpperCase()}`]
  );
  const vehicleId = vehicleRows[0].id;

  const { rows: passengerRows } = await client.query(
    "insert into passengers (full_name, category, created_via) values ($1, 'man', 'phone') returning id",
    [`Test Passenger ${randomUUID().slice(0, 8)}`]
  );
  const passengerId = passengerRows[0].id;

  return {
    areaId,
    routeId,
    vehicleId,
    adminUserId,
    officeUserId,
    dispatcherUserId,
    driverUserId,
    passengerId,
  };
}

export async function seedDeparture(
  client: Client,
  fixture: Fixture,
  overrides: Partial<{
    seats_capacity: number;
    seats_released: number;
    hold_capacity_units: number;
    wheelchair_capacity: number;
    crossing_passenger_limit: number | null;
  }> = {}
): Promise<string> {
  const { rows } = await client.query(
    `insert into departures (
       route_id, direction, depart_at, status,
       seats_capacity, seats_released, hold_capacity_units, wheelchair_capacity,
       crossing_passenger_limit
     ) values ($1, 'outbound', now() + interval '5 days', 'published', $2, $3, $4, $5, $6)
     returning id`,
    [
      fixture.routeId,
      overrides.seats_capacity ?? 4,
      overrides.seats_released ?? 4,
      overrides.hold_capacity_units ?? 10,
      overrides.wheelchair_capacity ?? 1,
      overrides.crossing_passenger_limit ?? null,
    ]
  );
  return rows[0].id;
}

export function bookingPassengerPayload(
  passengerId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    passenger_id: passengerId,
    category: "man",
    occupies_seat: true,
    currency: "GBP",
    notional_fare: 40,
    contribution: 40,
    sponsored: 0,
    subsidy: 0,
    luggage_units_consumed: 0,
    status: "provisional",
    ...overrides,
  };
}
