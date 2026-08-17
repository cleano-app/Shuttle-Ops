import { Client } from "pg";
import { config } from "dotenv";
import { join } from "path";

config({ path: join(__dirname, "..", ".env.local") });

// The integration/RLS suite (tests/integration, tests/rls) has no
// disposable per-run database yet (Phase 1 plan's open decision #5) — it
// runs against this same project, and every run's scratch rows
// (identifiable by the "Test " name prefix seedFixture/seedDeparture/
// seedDispatchScenario always use, and the "TEST-" vehicle registration
// prefix) accumulate here instead of being torn down. Confirmed this
// became visible clutter in the real Office UI once (dozens of stray
// "Test Route" departures on the Dispatch page).
//
// Run this after a test run, or periodically, to sweep it out. Deletion
// order matters - departures cascade to operational_stops/
// driver_assignments/handovers/departure_vehicles, and booking_passengers
// cascades to deposits/waivers, and parcels cascades to
// operational_stop_parcels, but bookings/trips/parcels/driver_duty_events/
// vehicle_checks/vehicle_defects/fleet_tasks/vehicle_documents/
// vehicle_maintenance do NOT cascade from departures or vehicles
// (deliberately - see each migration's own comment on why), so those are
// deleted explicitly first. Phase 4 added the same non-cascading pattern
// for cash_transactions (departure_id/booking_id/parcel_id),
// driver_expenses (departure_id), cancellations (booking_id),
// disruption_events (departure_id) and waitlist (departure_id) - all
// deleted explicitly here too, before their parent departures/bookings/
// parcels rows.
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query("begin");
  try {
    const { rows: departures } = await client.query(
      `select d.id from departures d join routes r on r.id = d.route_id where r.name like 'Test Route %'`
    );
    const departureIds = departures.map((d) => d.id);

    const { rows: vehicles } = await client.query(`select id from vehicles where registration like 'TEST-%'`);
    const vehicleIds = vehicles.map((v) => v.id);

    const { rows: passengers } = await client.query(`select id from passengers where full_name like 'Test Passenger %'`);
    const passengerIds = passengers.map((p) => p.id);

    if (departureIds.length > 0) {
      await client.query(
        `delete from cash_transactions
         where departure_id = any($1)
            or booking_id in (select id from bookings where departure_id = any($1))
            or parcel_id in (select id from parcels where departure_id = any($1))`,
        [departureIds]
      );
      await client.query(`delete from driver_expenses where departure_id = any($1)`, [departureIds]);
      await client.query(`delete from cancellations where booking_id in (select id from bookings where departure_id = any($1))`, [departureIds]);
      await client.query(`delete from disruption_events where departure_id = any($1)`, [departureIds]);
      await client.query(`delete from waitlist where departure_id = any($1)`, [departureIds]);
      await client.query(`delete from booking_passengers where booking_id in (select id from bookings where departure_id = any($1))`, [departureIds]);
      await client.query(`delete from parcels where departure_id = any($1)`, [departureIds]);
      await client.query(`delete from driver_duty_events where departure_id = any($1)`, [departureIds]);
    }
    if (vehicleIds.length > 0) {
      await client.query(`delete from vehicle_checks where vehicle_id = any($1)`, [vehicleIds]);
      await client.query(`delete from vehicle_defects where vehicle_id = any($1)`, [vehicleIds]);
      await client.query(`delete from fleet_tasks where vehicle_id = any($1)`, [vehicleIds]);
      await client.query(`delete from vehicle_documents where vehicle_id = any($1)`, [vehicleIds]);
      await client.query(`delete from vehicle_maintenance where vehicle_id = any($1)`, [vehicleIds]);
      await client.query(`delete from driver_duty_events where vehicle_id = any($1)`, [vehicleIds]);
    }
    if (passengerIds.length > 0) {
      await client.query(`delete from trips where lead_passenger_id = any($1)`, [passengerIds]);
    }
    if (departureIds.length > 0) {
      await client.query(`delete from bookings where departure_id = any($1)`, [departureIds]);
      await client.query(`delete from departures where id = any($1)`, [departureIds]);
    }

    const { rowCount: routesDeleted } = await client.query(`delete from routes where name like 'Test Route %'`);
    const { rowCount: vehiclesDeleted } = await client.query(`delete from vehicles where registration like 'TEST-%'`);
    const { rowCount: passengersDeleted } = await client.query(`delete from passengers where full_name like 'Test Passenger %'`);
    const { rowCount: addressesDeleted } = await client.query(`delete from addresses where line1 like 'Test Stop%'`);
    const { rowCount: areasDeleted } = await client.query(`delete from areas where name like 'Test Area %'`);

    await client.query("commit");

    console.log(`Removed: ${departureIds.length} departures, ${routesDeleted} routes, ${vehiclesDeleted} vehicles,`);
    console.log(`         ${passengersDeleted} passengers, ${addressesDeleted} addresses, ${areasDeleted} areas.`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
