import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "path";
import type { Database } from "../src/types/database";

config({ path: join(__dirname, "..", ".env.local") });

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Idempotent-ish: uses fixed, findable values (route code, registrations,
// area names) so re-running doesn't pile up duplicates. Intended for local/
// dev databases only — never point this at a production Supabase project.
async function main() {
  console.log("Seeding areas...");
  const areaRows = [
    { name: "Stamford Hill", country: "GB", running_order: 1 },
    { name: "Antwerp Centraal", country: "BE", running_order: 1 },
  ];
  const areaIds: Record<string, string> = {};
  for (const row of areaRows) {
    const { data: existing } = await admin
      .from("areas")
      .select("id")
      .eq("name", row.name)
      .maybeSingle();
    if (existing) {
      areaIds[row.name] = existing.id;
      continue;
    }
    const { data, error } = await admin.from("areas").insert(row).select("id").single();
    if (error) throw error;
    areaIds[row.name] = data.id;
  }

  console.log("Seeding route...");
  let routeId: string;
  const { data: existingRoute } = await admin
    .from("routes")
    .select("id")
    .eq("code", "LON-ANT")
    .maybeSingle();
  if (existingRoute) {
    routeId = existingRoute.id;
  } else {
    const { data, error } = await admin
      .from("routes")
      .insert({
        name: "London ⇄ Antwerp",
        code: "LON-ANT",
        origin_area_id: areaIds["Stamford Hill"],
        destination_area_id: areaIds["Antwerp Centraal"],
        supports_return: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    routeId = data.id;
  }

  console.log("Seeding vehicles...");
  const vehicleRows = [
    { registration: "SHUT-001", make_model: "Mercedes Sprinter", seat_capacity: 16, hold_capacity_units: 26, wheelchair_capacity: 2 },
    { registration: "SHUT-002", make_model: "Ford Transit", seat_capacity: 12, hold_capacity_units: 18, wheelchair_capacity: 1 },
  ];
  for (const row of vehicleRows) {
    const { data: existing } = await admin
      .from("vehicles")
      .select("id")
      .eq("registration", row.registration)
      .maybeSingle();
    if (!existing) {
      const { error } = await admin.from("vehicles").insert(row);
      if (error) throw error;
    }
  }

  console.log("Seeding tariffs...");
  const { data: existingTariff } = await admin
    .from("tariffs")
    .select("id")
    .eq("route_id", routeId)
    .is("category", null)
    .maybeSingle();
  if (!existingTariff) {
    const { error } = await admin.from("tariffs").insert({
      route_id: routeId,
      direction: null,
      category: null,
      base_fare_gbp: 40,
      base_fare_eur: 45,
      luggage_large_allowance: 1,
      luggage_small_allowance: 1,
      luggage_hand_allowance: 1,
      luggage_additional_charge_gbp: 10,
      luggage_additional_charge_eur: 12,
      luggage_oversize_charge_gbp: 20,
      luggage_oversize_charge_eur: 24,
      capacity_units_per_large: 1,
      capacity_units_per_small: 1,
      capacity_units_per_oversize: 2,
    });
    if (error) throw error;
  }
  const { data: infantTariff } = await admin
    .from("tariffs")
    .select("id")
    .eq("route_id", routeId)
    .eq("category", "infant")
    .maybeSingle();
  if (!infantTariff) {
    const { error } = await admin.from("tariffs").insert({
      route_id: routeId,
      direction: null,
      category: "infant",
      base_fare_gbp: 0,
      base_fare_eur: 0,
      luggage_large_allowance: 0,
      luggage_small_allowance: 0,
      luggage_hand_allowance: 0,
    });
    if (error) throw error;
  }

  console.log("Seeding departure...");
  const departAt = new Date();
  departAt.setDate(departAt.getDate() + 5);
  departAt.setHours(7, 0, 0, 0);
  const { data: existingDeparture } = await admin
    .from("departures")
    .select("id")
    .eq("route_id", routeId)
    .eq("depart_at", departAt.toISOString())
    .maybeSingle();
  let departureId: string;
  if (existingDeparture) {
    departureId = existingDeparture.id;
  } else {
    const { data, error } = await admin
      .from("departures")
      .insert({
        route_id: routeId,
        direction: "outbound",
        depart_at: departAt.toISOString(),
        status: "published",
        seats_capacity: 16,
        // Deliberately less than capacity, leaving room for manual testing
        // of the Booking Console without immediately hitting no_seats.
        seats_released: 12,
        hold_capacity_units: 26,
        wheelchair_capacity: 2,
        crossing_reference: "DEMO-XING-001",
        crossing_passenger_limit: 14,
        crossing_checkin_deadline: new Date(departAt.getTime() + 3.5 * 3600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    departureId = data.id;
  }
  console.log(`  departure ready: ${departureId}`);

  console.log("Seeding addresses...");
  const addressRows = [
    { line1: "22 Stamford Hill", postcode: "N16 6XB", city: "London", country: "GB", area_id: areaIds["Stamford Hill"], address_type: "residential" as const },
    { line1: "14 Amhurst Park", postcode: "N16 5AE", city: "London", country: "GB", area_id: areaIds["Stamford Hill"], address_type: "residential" as const },
    { line1: "Pelikaanstraat 1", postcode: "2018", city: "Antwerp", country: "BE", area_id: areaIds["Antwerp Centraal"], address_type: "residential" as const },
  ];
  const addressIds: string[] = [];
  for (const row of addressRows) {
    const { data: existing } = await admin
      .from("addresses")
      .select("id")
      .eq("line1", row.line1)
      .eq("postcode", row.postcode)
      .maybeSingle();
    if (existing) {
      addressIds.push(existing.id);
      continue;
    }
    const { data, error } = await admin.from("addresses").insert(row).select("id").single();
    if (error) throw error;
    addressIds.push(data.id);
  }

  console.log("Seeding walk-in passengers...");
  const passengerRows = [
    { full_name: "Chaya Weiss", phone: "+442012345678", category: "woman" as const, default_pickup_address_id: addressIds[0] },
    { full_name: "Yankel Weiss", phone: "+442012345678", category: "man" as const, default_pickup_address_id: addressIds[0] },
    { full_name: "Malka Friedman", phone: "+442012345679", category: "woman" as const, is_vulnerable: true, deposit_waiver_standing: true, default_pickup_address_id: addressIds[1] },
    { full_name: "Sruli Friedman", phone: "+442012345679", category: "boy" as const, default_pickup_address_id: addressIds[1] },
  ];
  for (const row of passengerRows) {
    const { data: existing } = await admin
      .from("passengers")
      .select("id")
      .eq("full_name", row.full_name)
      .eq("phone", row.phone)
      .maybeSingle();
    if (!existing) {
      const { error } = await admin.from("passengers").insert({ ...row, created_via: "phone" });
      if (error) throw error;
    }
  }

  console.log("Demo data ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
