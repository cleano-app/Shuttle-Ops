// Realistic test data for trying the app end to end (owner, 1 Oct 2026):
// three routes with tariffs, two weeks of departures in both directions,
// areas and addresses on both sides, a dozen passengers / families, and a
// handful of bookings in different states.
//
//   npm run db:seed-test-data            add (safe to re-run)
//   npm run db:seed-test-data -- --clean remove everything it added
//
// Everything it creates is findable: passengers use phone numbers in
// Ofcom's 07700 900xxx drama range (never a real line), routes use TEST-
// codes, departures carry a "TEST" crossing reference / note, and the
// third van is TEST-003. Bookings are inserted directly (the capacity
// function only accepts a signed-in office user), kept well inside each
// departure's capacity.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "path";
import type { Database } from "../src/types/database";
import { ukLocalToIso } from "../src/lib/time";

config({ path: join(__dirname, "..", ".env.local") });

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PHONE_PREFIX = "+447700900";
const NOTE = "TEST data (scripts/seed-test-data.ts)";

function must<T>(res: { data: T; error: { message: string } | null }, what: string): Exclude<T, null> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as Exclude<T, null>;
}

async function area(name: string, country: "GB" | "BE", order: number) {
  const found = await db.from("areas").select("id").eq("name", name).maybeSingle();
  if (found.data) return found.data.id;
  return must(await db.from("areas").insert({ name, country, running_order: order }).select("id").single(), `area ${name}`).id;
}

async function address(line1: string, postcode: string, city: string, country: "GB" | "BE", areaId: string, extra: Partial<{ address_type: "residential" | "fixed_point"; fixed_point_name: string; access_notes: string }> = {}) {
  const found = await db.from("addresses").select("id").eq("line1", line1).eq("postcode", postcode).maybeSingle();
  if (found.data) return found.data.id;
  return must(
    await db
      .from("addresses")
      .insert({ line1, postcode, city, country, area_id: areaId, address_type: extra.address_type ?? "residential", ...extra })
      .select("id")
      .single(),
    `address ${line1}`
  ).id;
}

async function route(code: string, name: string, origin: string, destination: string) {
  const found = await db.from("routes").select("id").eq("code", code).maybeSingle();
  const id =
    found.data?.id ??
    must(
      await db
        .from("routes")
        .insert({ code, name, origin_area_id: origin, destination_area_id: destination, supports_return: true })
        .select("id")
        .single(),
      `route ${code}`
    ).id;
  const { count } = await db.from("tariffs").select("id", { count: "exact", head: true }).eq("route_id", id);
  if (count) return id;
  // Default fare for everyone, infants free (same shape as seed-demo-data).
  // Two separate inserts: a multi-row insert sends null for any column one
  // row leaves out, which the not-null luggage columns refuse.
  must(
    await db.from("tariffs").insert(
      {
        route_id: id,
        direction: null,
        category: null,
        base_fare_gbp: code === "TEST-LON-MAN" ? 25 : 40,
        base_fare_eur: code === "TEST-LON-MAN" ? 30 : 45,
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
      }
    ),
    `tariff ${code}`
  );
  must(
    await db.from("tariffs").insert({
      route_id: id,
      direction: null,
      category: "infant",
      base_fare_gbp: 0,
      base_fare_eur: 0,
      luggage_large_allowance: 0,
      luggage_small_allowance: 0,
      luggage_hand_allowance: 0,
    }),
    `infant tariff ${code}`
  );
  return id;
}

/** The UK calendar date `n` days from today, as YYYY-MM-DD. */
function ukDate(n: number) {
  const d = new Date(Date.now() + n * 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}
function ukWeekday(n: number) {
  const d = new Date(`${ukDate(n)}T12:00:00Z`);
  return d.getUTCDay(); // 0 = Sunday
}

async function departure(
  routeId: string,
  direction: "outbound" | "return",
  day: number,
  time: string,
  opts: { seats: number; hold: number; wheelchair: number; crossing: boolean }
) {
  const departAt = ukLocalToIso(`${ukDate(day)}T${time}`)!;
  const found = await db.from("departures").select("id").eq("route_id", routeId).eq("depart_at", departAt).maybeSingle();
  if (found.data) return found.data.id;
  const start = new Date(departAt).getTime();
  return must(
    await db
      .from("departures")
      .insert({
        route_id: routeId,
        direction,
        depart_at: departAt,
        arrive_estimate: new Date(start + (opts.crossing ? 7.5 : 4.5) * 3600_000).toISOString(),
        status: "published",
        seats_capacity: opts.seats,
        seats_released: opts.seats,
        hold_capacity_units: opts.hold,
        wheelchair_capacity: opts.wheelchair,
        crossing_reference: opts.crossing ? `TEST-${ukDate(day).replaceAll("-", "").slice(2)}-${direction === "outbound" ? "O" : "R"}` : null,
        crossing_passenger_limit: opts.crossing ? opts.seats : null,
        crossing_checkin_deadline: opts.crossing
          ? new Date(start + (direction === "outbound" ? 3.5 : 2.5) * 3600_000).toISOString()
          : null,
        crossing_cost_gbp: opts.crossing ? 180 : null,
        notes: NOTE,
      })
      .select("id")
      .single(),
    `departure ${direction} ${ukDate(day)}`
  ).id;
}

interface PersonSeed {
  full_name: string;
  phone: string;
  category: Database["public"]["Tables"]["passengers"]["Insert"]["category"];
  pickup: string;
  dropoff: string;
  is_vulnerable?: boolean;
  deposit_waiver_standing?: boolean;
  mobility_needs?: string;
  preferred_language?: string;
}

async function passenger(p: PersonSeed) {
  const found = await db.from("passengers").select("id").eq("full_name", p.full_name).eq("phone", p.phone).maybeSingle();
  if (found.data) return found.data.id;
  return must(
    await db
      .from("passengers")
      .insert({
        full_name: p.full_name,
        phone: p.phone,
        category: p.category,
        is_vulnerable: p.is_vulnerable ?? false,
        deposit_waiver_standing: p.deposit_waiver_standing ?? false,
        mobility_needs: p.mobility_needs ?? null,
        preferred_language: p.preferred_language ?? "en",
        default_pickup_address_id: p.pickup,
        default_dropoff_address_id: p.dropoff,
        created_via: "phone",
      })
      .select("id")
      .single(),
    `passenger ${p.full_name}`
  ).id;
}

async function snapshot(addressId: string) {
  const a = must(await db.from("addresses").select("*").eq("id", addressId).single(), "address snapshot");
  return {
    address_id: a.id,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    postcode: a.postcode,
    country: a.country,
    access_notes: a.access_notes,
    fixed_point_name: a.fixed_point_name,
  };
}

type State = "confirmed" | "provisional" | "waived";

/** One booking for a party on a departure. Skips if the lead already has
 * a booking on it. */
async function book(departureId: string, party: { id: string; seed: PersonSeed }[], state: State, luggageLarge = 1) {
  const lead = party[0];
  const existing = await db
    .from("bookings")
    .select("id")
    .eq("departure_id", departureId)
    .eq("lead_passenger_id", lead.id)
    .maybeSingle();
  if (existing.data) return;

  const booking = must(
    await db
      .from("bookings")
      .insert({
        departure_id: departureId,
        lead_passenger_id: lead.id,
        channel: "phone",
        status: state === "provisional" ? "provisional" : "confirmed",
        notes: NOTE,
      })
      .select("id")
      .single(),
    "booking"
  );

  for (const { id, seed } of party) {
    const infant = seed.category === "infant";
    const fare = infant ? 0 : 40;
    const contribution = infant ? 0 : seed.deposit_waiver_standing ? 0 : 20;
    const large = infant ? 0 : luggageLarge;
    const bp = must(
      await db
        .from("booking_passengers")
        .insert({
          booking_id: booking.id,
          passenger_id: id,
          category: seed.category,
          occupies_seat: !infant,
          pickup_address_id: seed.pickup,
          dropoff_address_id: seed.dropoff,
          pickup_address_snapshot: await snapshot(seed.pickup),
          dropoff_address_snapshot: await snapshot(seed.dropoff),
          mobility_needs: seed.mobility_needs ?? null,
          wheelchair_space: Boolean(seed.mobility_needs?.includes("wheelchair")),
          currency: "GBP",
          notional_fare: fare,
          contribution,
          sponsored: 0,
          subsidy: fare - contribution,
          deposit_required: state === "confirmed" || state === "provisional",
          deposit_status: state === "waived" || seed.deposit_waiver_standing ? "waived" : state === "confirmed" ? "secured" : "required",
          luggage_large: large,
          luggage_small: infant ? 0 : 1,
          luggage_hand: infant ? 0 : 1,
          luggage_units_consumed: large + (infant ? 0 : 1),
          status: state === "provisional" ? "provisional" : "confirmed",
        })
        .select("id, deposit_status")
        .single(),
      "booking passenger"
    );
    if (bp.deposit_status === "secured") {
      must(
        await db.from("deposits").insert({
          booking_passenger_id: bp.id,
          amount: 20,
          currency: "GBP",
          status: "secured",
          method: "cash",
          taken_at: new Date().toISOString(),
          notes: NOTE,
        }),
        "deposit"
      );
    }
  }
}

async function clean() {
  const { data: people } = await db.from("passengers").select("id").like("phone", `${PHONE_PREFIX}%`);
  const ids = (people ?? []).map((p) => p.id);
  const { data: deps } = await db.from("departures").select("id").eq("notes", NOTE);
  const depIds = (deps ?? []).map((d) => d.id);
  const { data: bookings } = await db
    .from("bookings")
    .select("id")
    .or([ids.length ? `lead_passenger_id.in.(${ids.join(",")})` : "", depIds.length ? `departure_id.in.(${depIds.join(",")})` : ""].filter(Boolean).join(",") || "id.is.null");
  const bookingIds = (bookings ?? []).map((b) => b.id);
  if (bookingIds.length) {
    const { data: bps } = await db.from("booking_passengers").select("id").in("booking_id", bookingIds);
    const bpIds = (bps ?? []).map((b) => b.id);
    if (bpIds.length) {
      await db.from("operational_stop_passengers").delete().in("booking_passenger_id", bpIds);
      await db.from("deposits").delete().in("booking_passenger_id", bpIds);
      await db.from("cancellations").delete().in("booking_passenger_id", bpIds);
      await db.from("booking_passengers").update({ waiver_id: null }).in("id", bpIds);
      await db.from("waivers").delete().in("booking_passenger_id", bpIds);
    }
    await db.from("cancellations").delete().in("booking_id", bookingIds);
    await db.from("trips").update({ outbound_booking_id: null, return_booking_id: null }).or(`outbound_booking_id.in.(${bookingIds.join(",")}),return_booking_id.in.(${bookingIds.join(",")})`);
    must(await db.from("bookings").delete().in("id", bookingIds), "delete bookings");
  }
  if (depIds.length) {
    await db.from("operational_stops").delete().in("departure_id", depIds);
    await db.from("driver_assignments").delete().in("departure_id", depIds);
    await db.from("departure_vehicles").delete().in("departure_id", depIds);
    await db.from("waitlist").delete().in("departure_id", depIds);
    must(await db.from("departures").delete().in("id", depIds), "delete departures");
  }
  if (ids.length) {
    await db.from("waitlist").delete().in("passenger_id", ids);
    await db.from("call_logs").update({ matched_passenger_id: null }).in("matched_passenger_id", ids);
    must(await db.from("passengers").delete().in("id", ids), "delete passengers");
  }
  const { data: routes } = await db.from("routes").select("id").like("code", "TEST-%");
  const routeIds = (routes ?? []).map((r) => r.id);
  if (routeIds.length) {
    await db.from("tariffs").delete().in("route_id", routeIds);
    await db.from("route_templates").delete().in("route_id", routeIds);
    must(await db.from("routes").delete().in("id", routeIds), "delete routes");
  }
  await db.from("vehicles").delete().eq("registration", "TEST-003");
  console.log(`Removed ${ids.length} passengers, ${depIds.length} departures, ${bookingIds.length} bookings, ${routeIds.length} routes.`);
}

async function seed() {
  console.log("Areas and addresses...");
  const A = {
    stamford: await area("Stamford Hill", "GB", 1),
    golders: await area("Golders Green", "GB", 2),
    hendon: await area("Hendon", "GB", 3),
    folkestone: await area("Folkestone (crossing)", "GB", 10),
    centraal: await area("Antwerp Centraal", "BE", 1),
    berchem: await area("Berchem", "BE", 2),
    wilrijk: await area("Wilrijk", "BE", 3),
    broughton: await area("Broughton Park", "GB", 1),
    prestwich: await area("Prestwich", "GB", 2),
  };
  const ad = {
    egerton: await address("41 Egerton Road", "N16 6UE", "London", "GB", A.stamford),
    darenth: await address("8 Darenth Road", "N16 6EP", "London", "GB", A.stamford, { access_notes: "Side door, ring twice" }),
    finchley: await address("112 Finchley Road", "NW11 7AA", "London", "GB", A.golders),
    brent: await address("27 Brent Street", "NW4 2EF", "London", "GB", A.hendon),
    lange: await address("Lange Kievitstraat 64", "2018", "Antwerpen", "BE", A.centraal),
    belgielei: await address("Belgiëlei 120", "2018", "Antwerpen", "BE", A.centraal),
    statie: await address("Statiestraat 15", "2600", "Berchem", "BE", A.berchem),
    boomsestwg: await address("Boomsesteenweg 300", "2610", "Wilrijk", "BE", A.wilrijk, { access_notes: "Flat 3, lift at the back" }),
    bury: await address("Bury Old Road 405", "M7 4QY", "Salford", "GB", A.broughton),
    leicester: await address("12 Leicester Road", "M7 4AS", "Salford", "GB", A.broughton),
    prestwichHigh: await address("88 Bury New Road", "M25 0JW", "Prestwich", "GB", A.prestwich),
  };

  console.log("Routes and tariffs...");
  const lonAnt = (await db.from("routes").select("id").eq("code", "LON-ANT").maybeSingle()).data?.id
    ?? (await route("TEST-LON-ANT", "London ⇄ Antwerp", A.stamford, A.centraal));
  const manAnt = await route("TEST-MAN-ANT", "Manchester ⇄ Antwerp", A.broughton, A.centraal);
  const lonMan = await route("TEST-LON-MAN", "London ⇄ Manchester", A.stamford, A.broughton);

  console.log("Vehicle...");
  const van = await db.from("vehicles").select("id").eq("registration", "TEST-003").maybeSingle();
  if (!van.data) {
    must(
      await db.from("vehicles").insert({
        registration: "TEST-003",
        make_model: "Mercedes Sprinter 519 (test)",
        seat_capacity: 19,
        hold_capacity_units: 30,
        wheelchair_capacity: 1,
        status: "available",
        notes: NOTE,
      }),
      "vehicle"
    );
  }

  console.log("Departures for the next two weeks...");
  const big = { seats: 16, hold: 26, wheelchair: 1, crossing: true };
  const made: { id: string; route: string; direction: string; day: number }[] = [];
  for (let day = 1; day <= 14; day++) {
    const wd = ukWeekday(day);
    // London ⇄ Antwerp: out Sun/Tue/Thu 07:00, back Mon/Wed/Fri 14:00.
    if ([0, 2, 4].includes(wd)) made.push({ id: await departure(lonAnt, "outbound", day, "07:00", big), route: "LON-ANT", direction: "outbound", day });
    if ([1, 3, 5].includes(wd)) made.push({ id: await departure(lonAnt, "return", day, "14:00", big), route: "LON-ANT", direction: "return", day });
    // Manchester ⇄ Antwerp: out Sunday 05:30, back Thursday 13:00.
    if (wd === 0) made.push({ id: await departure(manAnt, "outbound", day, "05:30", big), route: "MAN-ANT", direction: "outbound", day });
    if (wd === 4) made.push({ id: await departure(manAnt, "return", day, "13:00", big), route: "MAN-ANT", direction: "return", day });
    // London ⇄ Manchester (no crossing): out Friday 09:00, back Sunday 17:00.
    const domestic = { seats: 12, hold: 18, wheelchair: 1, crossing: false };
    if (wd === 5) made.push({ id: await departure(lonMan, "outbound", day, "09:00", domestic), route: "LON-MAN", direction: "outbound", day });
    if (wd === 0) made.push({ id: await departure(lonMan, "return", day, "17:00", domestic), route: "LON-MAN", direction: "return", day });
  }

  console.log("Passengers and families...");
  const n = (i: number) => `${PHONE_PREFIX}${String(i).padStart(3, "0")}`;
  const seeds: Record<string, PersonSeed[]> = {
    // A family of five from Stamford Hill to Antwerp, standing waiver.
    rosenberg: [
      { full_name: "Shloime Rosenberg", phone: n(101), category: "man", pickup: ad.egerton, dropoff: ad.lange, deposit_waiver_standing: true, preferred_language: "yi" },
      { full_name: "Raizy Rosenberg", phone: n(101), category: "woman", pickup: ad.egerton, dropoff: ad.lange, deposit_waiver_standing: true },
      { full_name: "Mendy Rosenberg", phone: n(101), category: "boy", pickup: ad.egerton, dropoff: ad.lange },
      { full_name: "Faigy Rosenberg", phone: n(101), category: "girl", pickup: ad.egerton, dropoff: ad.lange },
      { full_name: "Baby Rosenberg", phone: n(101), category: "infant", pickup: ad.egerton, dropoff: ad.lange },
    ],
    // Couple from Golders Green.
    katz: [
      { full_name: "Dovid Katz", phone: n(102), category: "man", pickup: ad.finchley, dropoff: ad.belgielei },
      { full_name: "Esther Katz", phone: n(102), category: "woman", pickup: ad.finchley, dropoff: ad.belgielei },
    ],
    // Elderly woman, wheelchair, vulnerable.
    stern: [
      { full_name: "Bluma Stern", phone: n(103), category: "woman", pickup: ad.darenth, dropoff: ad.boomsestwg, is_vulnerable: true, deposit_waiver_standing: true, mobility_needs: "Uses a wheelchair; needs help boarding" },
    ],
    // Single traveller from Hendon.
    levy: [{ full_name: "Avrohom Levy", phone: n(104), category: "man", pickup: ad.brent, dropoff: ad.statie }],
    // Antwerp family going to London (return leg).
    pollak: [
      { full_name: "Yossi Pollak", phone: n(105), category: "man", pickup: ad.belgielei, dropoff: ad.egerton, preferred_language: "nl" },
      { full_name: "Chani Pollak", phone: n(105), category: "woman", pickup: ad.belgielei, dropoff: ad.egerton },
      { full_name: "Pollak family 3", phone: n(105), category: "unspecified", pickup: ad.belgielei, dropoff: ad.egerton },
    ],
    // Manchester travellers.
    green: [
      { full_name: "Moishe Green", phone: n(106), category: "man", pickup: ad.bury, dropoff: ad.lange },
      { full_name: "Perel Green", phone: n(106), category: "woman", pickup: ad.bury, dropoff: ad.lange },
    ],
    adler: [{ full_name: "Leah Adler", phone: n(107), category: "woman", pickup: ad.leicester, dropoff: ad.egerton }],
    weinberg: [{ full_name: "Hershy Weinberg", phone: n(108), category: "boy", pickup: ad.prestwichHigh, dropoff: ad.darenth }],
  };
  const people: Record<string, { id: string; seed: PersonSeed }[]> = {};
  for (const [family, members] of Object.entries(seeds)) {
    people[family] = [];
    for (const m of members) people[family].push({ id: await passenger(m), seed: m });
  }

  console.log("Bookings...");
  const next = (route: string, direction: string, nth = 0) =>
    made.filter((d) => d.route === route && d.direction === direction).sort((a, b) => a.day - b.day)[nth]?.id;
  const firstOut = next("LON-ANT", "outbound");
  const secondOut = next("LON-ANT", "outbound", 1);
  const firstBack = next("LON-ANT", "return");
  const manOut = next("MAN-ANT", "outbound");
  const lonManOut = next("LON-MAN", "outbound");
  if (firstOut) {
    await book(firstOut, people.rosenberg, "waived", 1);
    await book(firstOut, people.katz, "confirmed", 2);
    await book(firstOut, people.stern, "waived", 1);
    await book(firstOut, people.levy, "provisional", 1);
  }
  if (secondOut) await book(secondOut, people.levy.map((p) => ({ ...p })), "confirmed", 1).catch(() => {});
  if (firstBack) await book(firstBack, people.pollak, "provisional", 2);
  if (manOut) await book(manOut, people.green, "confirmed", 2);
  if (lonManOut) await book(lonManOut, people.adler, "provisional", 1);

  const total = Object.values(people).flat().length;
  console.log(`Done: 3 routes, ${made.length} departures, ${total} passengers, bookings on ${[firstOut, firstBack, manOut, lonManOut].filter(Boolean).length + (secondOut ? 1 : 0)} departures.`);
}

(process.argv.includes("--clean") ? clean() : seed()).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
