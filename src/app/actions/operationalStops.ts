"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { assessCheckinRisk, type StopEtaInput } from "@/lib/eta/estimateLegMinutes";
import { assignParcelToStop } from "@/app/actions/parcels";
import {
  mergeStopOrder,
  assignSequences,
  planArrivalTimes,
  type PlanStop,
  type PlanStopType,
  type TimingStop,
  type LegTimingRow,
} from "@/app/office/dispatch/_lib/planStops";
import type { StopPassengerRole, StopType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
  message?: string;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}

/** RPCs added after src/types/database.ts was last regenerated. Called on
 * the client object so `this` stays bound. */
type UntypedRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** One row of get_dispatch_booking_passengers() (0058) — operational fields
 * only, never fares, deposits or vulnerability notes. */
export interface DispatchPassenger {
  booking_passenger_id: string;
  booking_id: string;
  booking_reference: string;
  booking_status: string;
  status: string;
  passenger_id: string;
  full_name: string;
  phone: string | null;
  category: string;
  occupies_seat: boolean;
  departure_vehicle_id: string | null;
  pickup_address_id: string | null;
  dropoff_address_id: string | null;
  mobility_needs: string | null;
  wheelchair_space: boolean;
  luggage_large: number;
  luggage_small: number;
  luggage_hand: number;
  luggage_oversize: number;
  no_show: boolean;
  boarded_at: string | null;
}

const INACTIVE_PASSENGER_STATUSES = new Set(["cancelled", "expired", "no_show"]);
const DROPPED_PASSENGER_STATUSES = new Set(["cancelled", "expired"]);
const ACTIVE_PARCEL_STATUSES = new Set(["booked", "collection_due", "collected", "onboard", "delivery_due"]);

/** Is this booking passenger actually travelling (for stop generation)? */
function isTravelling(p: DispatchPassenger) {
  return !INACTIVE_PASSENGER_STATUSES.has(p.status) && !INACTIVE_PASSENGER_STATUSES.has(p.booking_status);
}

export async function getDispatchPassengers(
  departureId: string
): Promise<{ error?: string; passengers: DispatchPassenger[] }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", passengers: [] };
  }
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as UntypedRpcClient).rpc("get_dispatch_booking_passengers", {
    p_departure_id: departureId,
  });
  if (error) return { error: error.message, passengers: [] };
  return { passengers: (data ?? []) as DispatchPassenger[] };
}

export async function createStop(input: {
  departure_id: string;
  address_id: string;
  stop_type: StopType;
  planned_sequence?: number;
  planned_arrival_at?: string | null;
  departure_vehicle_id?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }
  if (!input.address_id) return { error: "Choose an address for the stop." };

  const supabase = await createClient();
  let sequence = input.planned_sequence;
  let where = "at the end of the route";
  if (sequence == null) {
    const { data: existing, error: listError } = await supabase
      .from("operational_stops")
      .select("id, planned_sequence, stop_type")
      .eq("departure_id", input.departure_id)
      .order("planned_sequence", { ascending: true });
    if (listError) return { error: listError.message };
    const rows = existing ?? [];
    sequence = rows.length ? rows[rows.length - 1].planned_sequence + 1 : 0;
    // Pickups and the crossing belong after the last pickup, before the
    // drop-offs - not tacked on after the last drop-off.
    if (input.stop_type === "pickup" || input.stop_type === "crossing") {
      const lastPickup = rows.filter((r) => r.stop_type === "pickup").pop();
      const firstDropoff = rows.find((r) => r.stop_type === "dropoff");
      const pos = lastPickup ? lastPickup.planned_sequence + 1 : firstDropoff ? firstDropoff.planned_sequence : sequence;
      if (pos < sequence) {
        // Make room: everything from pos on moves down one.
        const later = rows.filter((r) => r.planned_sequence >= pos).reverse();
        for (const r of later) {
          const { error } = await supabase
            .from("operational_stops")
            .update({ planned_sequence: r.planned_sequence + 1 })
            .eq("id", r.id);
          if (error) return { error: error.message };
        }
        sequence = pos;
        where = input.stop_type === "crossing" ? "between the pickups and the drop-offs" : "after the last pickup";
      }
    }
  }

  const { data, error } = await supabase
    .from("operational_stops")
    .insert({ ...input, planned_sequence: sequence })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Re-estimate planned times now the route has a new stop (this also
  // places any passengers or parcels waiting for a stop at this address).
  let timesNote = "";
  if (!input.planned_arrival_at) {
    const regen = await generateStopsFromBookings(input.departure_id);
    if (regen.error) timesNote = ` Planned times weren't re-estimated: ${regen.error}`;
  }

  revalidatePath(`/office/dispatch/${input.departure_id}`);
  return { success: true, id: data.id, message: `Stop added ${where}.${timesNote}` };
}

export async function updateStop(
  id: string,
  input: Partial<{
    address_id: string;
    stop_type: StopType;
    planned_arrival_at: string | null;
    driver_notes: string | null;
  }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: stop, error: fetchError } = await supabase
    .from("operational_stops")
    .select("locked, departure_id")
    .eq("id", id)
    .single();
  if (fetchError || !stop) return { error: fetchError?.message ?? "Stop not found." };
  if (stop.locked) return { error: "This stop is locked. Unlock it before editing." };

  const { error } = await supabase.from("operational_stops").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${stop.departure_id}`);
  return { success: true, message: "Stop updated." };
}

export async function setStopLocked(id: string, locked: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("operational_stops")
    .update({ locked })
    .eq("id", id)
    .select("departure_id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${data.departure_id}`);
  return { success: true };
}

export async function deleteStop(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: stop, error: fetchError } = await supabase
    .from("operational_stops")
    .select("locked, departure_id, status")
    .eq("id", id)
    .single();
  if (fetchError || !stop) return { error: fetchError?.message ?? "Stop not found." };
  if (stop.locked) return { error: "This stop is locked. Unlock it before removing." };
  if (stop.status !== "pending") return { error: "A driver has already reached this stop - it can't be removed." };

  const { error } = await supabase.from("operational_stops").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${stop.departure_id}`);
  return { success: true };
}

/**
 * Manual reorder (build spec §20: "Office can: drag stops..."). Takes the
 * full ordered list of stop IDs for a departure and reassigns
 * planned_sequence 0..n-1 to match. Locked stops are skipped.
 */
export async function reorderStops(departureId: string, orderedStopIds: string[]): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  for (let i = 0; i < orderedStopIds.length; i++) {
    const { error } = await supabase
      .from("operational_stops")
      .update({ planned_sequence: i })
      .eq("id", orderedStopIds[i])
      .eq("departure_id", departureId)
      .eq("locked", false);
    if (error) return { error: error.message };
  }

  revalidatePath(`/office/dispatch/${departureId}`);
  return { success: true };
}

/**
 * Single-step move (swap planned_sequence with the immediate neighbour) —
 * the plain-HTML-forms equivalent of a drag handle.
 */
export async function moveStop(
  departureId: string,
  stopId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: stops, error: fetchError } = await supabase
    .from("operational_stops")
    .select("id, planned_sequence, locked")
    .eq("departure_id", departureId)
    .order("planned_sequence", { ascending: true });
  if (fetchError) return { error: fetchError.message };

  const index = (stops ?? []).findIndex((s) => s.id === stopId);
  if (index === -1) return { error: "Stop not found." };
  const neighbourIndex = direction === "up" ? index - 1 : index + 1;
  if (neighbourIndex < 0 || neighbourIndex >= (stops?.length ?? 0)) {
    return { error: direction === "up" ? "Already the first stop." : "Already the last stop." };
  }

  const current = stops![index];
  const neighbour = stops![neighbourIndex];
  if (current.locked || neighbour.locked) {
    return { error: "One of these stops is locked." };
  }

  // Stops share a planned_sequence when two were added at once in older
  // data - fall back to positional numbers so the swap always moves.
  const a = current.planned_sequence === neighbour.planned_sequence ? neighbourIndex : neighbour.planned_sequence;
  const b = current.planned_sequence === neighbour.planned_sequence ? index : current.planned_sequence;

  const { error: e1 } = await supabase.from("operational_stops").update({ planned_sequence: a }).eq("id", current.id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase.from("operational_stops").update({ planned_sequence: b }).eq("id", neighbour.id);
  if (e2) return { error: e2.message };

  revalidatePath(`/office/dispatch/${departureId}`);
  return { success: true };
}

/**
 * Groups a passenger's pickup or drop-off into an existing stop (build
 * spec §20). This action IS the confirmation.
 */
export async function assignPassengerToStop(input: {
  operationalStopId: string;
  bookingPassengerId: string;
  role: StopPassengerRole;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("operational_stop_passengers").upsert(
    {
      operational_stop_id: input.operationalStopId,
      booking_passenger_id: input.bookingPassengerId,
      role: input.role,
    },
    { onConflict: "operational_stop_id,booking_passenger_id,role" }
  );
  if (error) return { error: error.message };

  return { success: true };
}

export async function removePassengerFromStop(operationalStopPassengerId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("operational_stop_passengers")
    .delete()
    .eq("id", operationalStopPassengerId);
  if (error) return { error: error.message };

  return { success: true };
}

interface AddressInfo {
  id: string;
  line1: string;
  postcode: string;
  area_id: string | null;
  areas: { running_order: number; country: string } | null;
}

/**
 * "Generate / Update stops from bookings". Safe to run again and again:
 *
 *  - Booking passengers and parcels not yet on a stop get one. Everyone at
 *    the same address (same direction of travel) shares one stop - running
 *    this is the dispatcher confirming that grouping (§20).
 *  - Cancelled/expired passengers and cancelled parcels come off their
 *    stops (unless already boarded); a generated stop left empty goes.
 *    No-shows are skipped for new stops but left where they are.
 *  - New stops slot in by area running_order (pickups, then the crossing,
 *    then drop-offs). Existing order is kept; locked stops and stops a
 *    driver has reached keep their position.
 *  - If the departure has no crossing stop yet and a route template for
 *    this route/direction has one, it's added between pickups and drop-offs.
 *  - planned_arrival_at is (re)estimated for every pending, unlocked stop
 *    from leg_timings history, falling back to the template's offsets and
 *    then rough defaults - so the crossing check-in warning has numbers.
 *
 * Every write is checked; the first failure is returned to the caller.
 */
export async function generateStopsFromBookings(departureId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();

  const { data: departure, error: depError } = await supabase
    .from("departures")
    .select("id, route_id, direction, depart_at, status")
    .eq("id", departureId)
    .single();
  if (depError || !departure) return { error: depError?.message ?? "Departure not found." };
  if (departure.status === "cancelled" || departure.status === "completed") {
    return { error: `This departure is ${departure.status} - stops can't be regenerated.` };
  }

  const [passengersRes, parcelsRes, stopsRes, assignmentsRes, templatesRes] = await Promise.all([
    getDispatchPassengers(departureId),
    supabase
      .from("parcels")
      .select("id, reference, status, sender_address_id, recipient_address_id")
      .eq("departure_id", departureId),
    supabase
      .from("operational_stops")
      .select("id, address_id, stop_type, planned_sequence, planned_arrival_at, actual_arrival_at, actual_departure_at, locked, status")
      .eq("departure_id", departureId)
      .order("planned_sequence", { ascending: true }),
    supabase
      .from("driver_assignments")
      .select("id, from_stop_sequence, to_stop_sequence, status")
      .eq("departure_id", departureId),
    supabase
      .from("route_templates")
      .select("id, created_at, route_template_stops(*)")
      .eq("route_id", departure.route_id)
      .eq("direction", departure.direction)
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);
  if (passengersRes.error) return { error: `Couldn't read passengers: ${passengersRes.error}` };
  if (parcelsRes.error) return { error: `Couldn't read parcels: ${parcelsRes.error.message}` };
  if (stopsRes.error) return { error: `Couldn't read stops: ${stopsRes.error.message}` };
  if (assignmentsRes.error) return { error: assignmentsRes.error.message };
  if (templatesRes.error) return { error: templatesRes.error.message };

  const passengers = passengersRes.passengers;
  const parcels = parcelsRes.data ?? [];
  const stops = stopsRes.data ?? [];
  const stopIds = stops.map((s) => s.id);

  const [ospRes, ostpRes] = stopIds.length
    ? await Promise.all([
        supabase
          .from("operational_stop_passengers")
          .select("id, operational_stop_id, booking_passenger_id, role, boarded")
          .in("operational_stop_id", stopIds),
        supabase
          .from("operational_stop_parcels")
          .select("id, operational_stop_id, parcel_id, role")
          .in("operational_stop_id", stopIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (ospRes.error) return { error: ospRes.error.message };
  if (ostpRes.error) return { error: ostpRes.error.message };
  let osp = ospRes.data ?? [];
  let ostp = ostpRes.data ?? [];

  const passengerById = new Map(passengers.map((p) => [p.booking_passenger_id, p]));
  const parcelById = new Map(parcels.map((p) => [p.id, p]));

  // --- 1. Take cancelled passengers / parcels off their stops. ---
  const touchedStops = new Set<string>();
  const dropOsp = osp.filter((row) => {
    const p = passengerById.get(row.booking_passenger_id);
    if (!p || row.boarded) return false;
    return DROPPED_PASSENGER_STATUSES.has(p.status) || DROPPED_PASSENGER_STATUSES.has(p.booking_status);
  });
  if (dropOsp.length) {
    const { error } = await supabase
      .from("operational_stop_passengers")
      .delete()
      .in(
        "id",
        dropOsp.map((r) => r.id)
      );
    if (error) return { error: `Couldn't remove cancelled passengers: ${error.message}` };
    dropOsp.forEach((r) => touchedStops.add(r.operational_stop_id));
    const dropped = new Set(dropOsp.map((r) => r.id));
    osp = osp.filter((r) => !dropped.has(r.id));
  }
  const dropOstp = ostp.filter((row) => parcelById.get(row.parcel_id)?.status === "cancelled");
  if (dropOstp.length) {
    const { error } = await supabase
      .from("operational_stop_parcels")
      .delete()
      .in(
        "id",
        dropOstp.map((r) => r.id)
      );
    if (error) return { error: `Couldn't remove cancelled parcels: ${error.message}` };
    dropOstp.forEach((r) => touchedStops.add(r.operational_stop_id));
    const dropped = new Set(dropOstp.map((r) => r.id));
    ostp = ostp.filter((r) => !dropped.has(r.id));
  }

  // A generated stop left with nobody at it goes (manual stops that never
  // had anyone are left alone - only stops this run emptied).
  const emptied = stops.filter(
    (s) =>
      touchedStops.has(s.id) &&
      !s.locked &&
      s.status === "pending" &&
      (s.stop_type === "pickup" || s.stop_type === "dropoff") &&
      !osp.some((r) => r.operational_stop_id === s.id) &&
      !ostp.some((r) => r.operational_stop_id === s.id)
  );
  if (emptied.length) {
    const { error } = await supabase
      .from("operational_stops")
      .delete()
      .in(
        "id",
        emptied.map((s) => s.id)
      );
    if (error) return { error: `Couldn't remove empty stops: ${error.message}` };
  }
  const emptiedIds = new Set(emptied.map((s) => s.id));
  const liveStops = stops.filter((s) => !emptiedIds.has(s.id));

  // --- 2. Work out who still needs a stop. ---
  type Need = { addressId: string; stopType: "pickup" | "dropoff"; passengerIds: string[]; parcelLinks: { parcelId: string; role: "collection" | "delivery" }[] };
  const needs = new Map<string, Need>();
  const needFor = (addressId: string, stopType: "pickup" | "dropoff") => {
    const k = `${stopType}:${addressId}`;
    let n = needs.get(k);
    if (!n) {
      n = { addressId, stopType, passengerIds: [], parcelLinks: [] };
      needs.set(k, n);
    }
    return n;
  };

  const linkedPassenger = new Set(osp.map((r) => `${r.booking_passenger_id}:${r.role}`));
  for (const p of passengers) {
    if (!isTravelling(p)) continue;
    if (p.pickup_address_id && !linkedPassenger.has(`${p.booking_passenger_id}:pickup`)) {
      needFor(p.pickup_address_id, "pickup").passengerIds.push(p.booking_passenger_id);
    }
    if (p.dropoff_address_id && !linkedPassenger.has(`${p.booking_passenger_id}:dropoff`)) {
      needFor(p.dropoff_address_id, "dropoff").passengerIds.push(p.booking_passenger_id);
    }
  }
  const linkedParcel = new Set(ostp.map((r) => `${r.parcel_id}:${r.role}`));
  for (const pc of parcels) {
    if (!ACTIVE_PARCEL_STATUSES.has(pc.status)) continue;
    const alreadyAboard = pc.status === "collected" || pc.status === "onboard" || pc.status === "delivery_due";
    if (pc.sender_address_id && !alreadyAboard && !linkedParcel.has(`${pc.id}:collection`)) {
      needFor(pc.sender_address_id, "pickup").parcelLinks.push({ parcelId: pc.id, role: "collection" });
    }
    if (pc.recipient_address_id && !linkedParcel.has(`${pc.id}:delivery`)) {
      needFor(pc.recipient_address_id, "dropoff").parcelLinks.push({ parcelId: pc.id, role: "delivery" });
    }
  }

  // Crossing from a template, if the departure has none yet.
  type TemplateStop = {
    address_id: string | null;
    area_id: string | null;
    sequence: number;
    default_offset_minutes: number;
    stop_type?: string | null;
  };
  const templates = (templatesRes.data ?? []) as unknown as { id: string; route_template_stops: TemplateStop[] }[];
  const hasCrossing = liveStops.some((s) => s.stop_type === "crossing");
  let templateCrossing: TemplateStop | null = null;
  if (!hasCrossing) {
    for (const t of templates) {
      const c = (t.route_template_stops ?? []).find((ts) => ts.stop_type === "crossing" && ts.address_id);
      if (c) {
        templateCrossing = c;
        break;
      }
    }
  }

  // --- 3. Addresses / areas for ordering and timing. ---
  const templateAddressIds = templates.flatMap((t) => (t.route_template_stops ?? []).map((ts) => ts.address_id)).filter(
    (x): x is string => Boolean(x)
  );
  const addressIds = Array.from(
    new Set([
      ...liveStops.map((s) => s.address_id),
      ...Array.from(needs.values()).map((n) => n.addressId),
      ...templateAddressIds,
    ])
  );
  const { data: addrRows, error: addrError } = addressIds.length
    ? await supabase.from("addresses").select("id, line1, postcode, area_id, areas(running_order, country)").in("id", addressIds)
    : { data: [], error: null };
  if (addrError) return { error: addrError.message };
  const addressById = new Map(((addrRows ?? []) as unknown as AddressInfo[]).map((a) => [a.id, a]));

  // Existing stop at the same address + type takes new people (grouping).
  const pendingStopFor = (addressId: string, stopType: string) =>
    liveStops.find((s) => s.address_id === addressId && s.stop_type === stopType && s.status === "pending");

  const toPlan = (
    key: string,
    addressId: string,
    stopType: PlanStopType,
    extra: Partial<PlanStop>
  ): PlanStop => {
    const a = addressById.get(addressId);
    return {
      key,
      isNew: true,
      stopType,
      areaId: a?.area_id ?? null,
      areaOrder: a?.areas?.running_order ?? null,
      country: a?.areas?.country ?? null,
      label: `${a?.postcode ?? ""} ${a?.line1 ?? ""}`,
      sequence: -1,
      fixed: false,
      ...extra,
    };
  };

  const existingPlan: PlanStop[] = liveStops.map((s) =>
    toPlan(s.id, s.address_id, s.stop_type as PlanStopType, {
      isNew: false,
      sequence: s.planned_sequence,
      fixed: s.locked || s.status !== "pending",
      visited: s.status !== "pending",
    })
  );

  const additions: PlanStop[] = [];
  const newStopNeeds = new Map<string, Need | null>();
  const attachToExisting: { stopId: string; need: Need }[] = [];
  for (const [k, need] of needs) {
    const existing = pendingStopFor(need.addressId, need.stopType);
    if (existing) {
      attachToExisting.push({ stopId: existing.id, need });
    } else {
      additions.push(toPlan(`new:${k}`, need.addressId, need.stopType, {}));
      newStopNeeds.set(`new:${k}`, need);
    }
  }
  if (templateCrossing?.address_id) {
    additions.push(toPlan("new:crossing", templateCrossing.address_id, "crossing", {}));
    newStopNeeds.set("new:crossing", null);
  }

  const nothingToAdd = additions.length === 0 && attachToExisting.length === 0;
  if (nothingToAdd && liveStops.length === 0) {
    return {
      error:
        passengers.length === 0 && parcels.length === 0
          ? "No bookings or parcels on this departure yet."
          : "No travelling passenger or parcel on this departure has a pickup/drop-off address.",
    };
  }

  const ordered = mergeStopOrder(existingPlan, additions);
  const sequences = assignSequences(ordered);

  // --- 4. Planned times. ---
  const templateOffsets = new Map<string, number>();
  const firstTemplate = templates.find((t) => (t.route_template_stops ?? []).length > 0);
  for (const ts of firstTemplate?.route_template_stops ?? []) {
    const area = ts.area_id ?? (ts.address_id ? addressById.get(ts.address_id)?.area_id : null);
    if (area && !templateOffsets.has(area)) templateOffsets.set(area, ts.default_offset_minutes);
  }
  const areaIds = Array.from(new Set(ordered.map((s) => s.areaId).filter((x): x is string => Boolean(x))));
  const { data: legRows, error: legError } = areaIds.length
    ? await supabase
        .from("leg_timings")
        .select("from_area_id, to_area_id, day_of_week, time_band, sample_count, median_minutes")
        .in("from_area_id", areaIds)
        .in("to_area_id", areaIds)
    : { data: [], error: null };
  if (legError) return { error: legError.message };

  const stopById = new Map(liveStops.map((s) => [s.id, s]));
  const timingOrder: TimingStop[] = [...ordered]
    .sort((a, b) => sequences.get(a.key)! - sequences.get(b.key)!)
    .map((s) => {
      const existing = stopById.get(s.key);
      let anchorAt: string | null = null;
      if (existing) {
        if (existing.status !== "pending") {
          anchorAt = existing.actual_departure_at ?? existing.actual_arrival_at ?? existing.planned_arrival_at;
        } else if (existing.locked && existing.planned_arrival_at) {
          anchorAt = existing.planned_arrival_at;
        }
      }
      return { key: s.key, stopType: s.stopType, areaId: s.areaId, country: s.country, anchorAt };
    });
  const times = planArrivalTimes(
    timingOrder,
    new Date(departure.depart_at),
    (legRows ?? []) as LegTimingRow[],
    templateOffsets
  );

  // --- 5. Write: new stops, links, then sequence/time/expected counts. ---
  const keyToStopId = new Map<string, string>(liveStops.map((s) => [s.id, s.id]));
  for (const add of additions) {
    const { data: created, error } = await supabase
      .from("operational_stops")
      .insert({
        departure_id: departureId,
        address_id: addressByKey(add, newStopNeeds, templateCrossing),
        stop_type: add.stopType,
        planned_sequence: sequences.get(add.key)!,
        planned_arrival_at: times.get(add.key) ?? null,
      })
      .select("id")
      .single();
    if (error) return { error: `Couldn't create a stop: ${error.message}` };
    keyToStopId.set(add.key, created.id);
  }

  const ospInserts: { operational_stop_id: string; booking_passenger_id: string; role: "pickup" | "dropoff" }[] = [];
  const parcelLinks: { stopId: string; parcelId: string; role: "collection" | "delivery" }[] = [];
  const queue: { stopId: string; need: Need }[] = [...attachToExisting];
  for (const [key, need] of newStopNeeds) {
    if (need) queue.push({ stopId: keyToStopId.get(key)!, need });
  }
  for (const { stopId, need } of queue) {
    for (const bpId of need.passengerIds) {
      ospInserts.push({ operational_stop_id: stopId, booking_passenger_id: bpId, role: need.stopType });
    }
    for (const link of need.parcelLinks) parcelLinks.push({ stopId, ...link });
  }
  if (ospInserts.length) {
    const { error } = await supabase.from("operational_stop_passengers").insert(ospInserts);
    if (error) return { error: `Couldn't put passengers on stops: ${error.message}` };
  }
  for (const link of parcelLinks) {
    const res = await assignParcelToStop({ operationalStopId: link.stopId, parcelId: link.parcelId, role: link.role });
    if (res.error) return { error: `Couldn't put parcel ${parcelById.get(link.parcelId)?.reference ?? ""} on a stop: ${res.error}` };
  }

  // Expected counts per stop, from the final links.
  const finalOsp = [...osp, ...ospInserts.map((r) => ({ ...r, id: "", boarded: false }))];
  const finalOstp = [
    ...ostp,
    ...parcelLinks.map((l) => ({ id: "", operational_stop_id: l.stopId, parcel_id: l.parcelId, role: l.role })),
  ];
  let sequenceChanged = false;
  for (const s of ordered) {
    const stopId = keyToStopId.get(s.key);
    if (!stopId) continue;
    const existing = stopById.get(s.key);
    const riders = finalOsp
      .filter((r) => r.operational_stop_id === stopId)
      .map((r) => passengerById.get(r.booking_passenger_id))
      .filter((p): p is DispatchPassenger => Boolean(p) && !DROPPED_PASSENGER_STATUSES.has(p!.status));
    const update: {
      passengers_expected: number;
      luggage_expected: number;
      parcels_expected: number;
      planned_sequence?: number;
      planned_arrival_at?: string | null;
    } = {
      passengers_expected: riders.length,
      luggage_expected: riders.reduce((n, p) => n + p.luggage_large + p.luggage_small + p.luggage_oversize, 0),
      parcels_expected: finalOstp.filter((r) => r.operational_stop_id === stopId).length,
    };
    if (existing && existing.status === "pending" && !existing.locked) {
      const seq = sequences.get(s.key)!;
      if (seq !== existing.planned_sequence) {
        update.planned_sequence = seq;
        sequenceChanged = true;
      }
      update.planned_arrival_at = times.get(s.key) ?? existing.planned_arrival_at;
    }
    const { error } = await supabase.from("operational_stops").update(update).eq("id", stopId);
    if (error) return { error: `Couldn't update a stop: ${error.message}` };
  }

  revalidatePath(`/office/dispatch/${departureId}`);

  const parts: string[] = [];
  if (additions.length) parts.push(`${additions.length} new stop${additions.length === 1 ? "" : "s"}`);
  if (ospInserts.length) parts.push(`${ospInserts.length} passenger pickup/drop-off${ospInserts.length === 1 ? "" : "s"} placed`);
  if (parcelLinks.length) parts.push(`${parcelLinks.length} parcel collection/delivery${parcelLinks.length === 1 ? "" : "s"} placed`);
  if (dropOsp.length) parts.push(`${dropOsp.length} cancelled passenger stop${dropOsp.length === 1 ? "" : "s"} removed`);
  if (dropOstp.length) parts.push(`${dropOstp.length} cancelled parcel stop${dropOstp.length === 1 ? "" : "s"} removed`);
  if (templateCrossing) parts.push("crossing stop added from the route template");
  let message = parts.length
    ? `Updated: ${parts.join(", ")}. Planned times re-estimated.`
    : "Already up to date - every travelling passenger and parcel is on a stop. Planned times re-estimated.";
  const segmented = (assignmentsRes.data ?? []).some(
    (a) => a.status !== "declined" && (a.from_stop_sequence != null || a.to_stop_sequence != null)
  );
  if ((sequenceChanged || additions.length > 0) && segmented) {
    message += " Stop numbers changed - check the drivers' segment bounds below.";
  }
  return { success: true, message };
}

function addressByKey(
  add: PlanStop,
  newStopNeeds: Map<string, { addressId: string } | null>,
  templateCrossing: { address_id: string | null } | null
): string {
  const need = newStopNeeds.get(add.key);
  if (need) return need.addressId;
  return templateCrossing!.address_id!;
}

/**
 * Build spec §20: "The system warns when projected arrival risks missing
 * the crossing check-in deadline." Before the run starts the projection is
 * anchored at the first stop's planned time (not "now", which would make a
 * departure next week look comfortably early); once a driver has left a
 * stop it runs from that actual time.
 */
export async function getCheckinWarning(departureId: string): Promise<{
  error?: string;
  risk: ReturnType<typeof assessCheckinRisk>;
  missingCrossing?: boolean;
  missingTimes?: boolean;
}> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", risk: null };
  }

  const supabase = await createClient();
  const [{ data: departure, error: depError }, { data: stops, error: stopsError }] = await Promise.all([
    supabase.from("departures").select("crossing_checkin_deadline, depart_at").eq("id", departureId).single(),
    supabase
      .from("operational_stops")
      .select("planned_sequence, stop_type, planned_arrival_at, actual_arrival_at, actual_departure_at")
      .eq("departure_id", departureId)
      .order("planned_sequence", { ascending: true }),
  ]);
  if (depError) return { error: depError.message, risk: null };
  if (stopsError) return { error: stopsError.message, risk: null };

  if (!departure?.crossing_checkin_deadline || !stops || stops.length === 0) {
    return { risk: null };
  }
  if (!stops.some((s) => s.stop_type === "crossing")) {
    return { risk: null, missingCrossing: true };
  }
  const crossingIdx = stops.findIndex((s) => s.stop_type === "crossing");
  const missingTimes = stops.slice(0, crossingIdx + 1).some((s) => !s.planned_arrival_at && !s.actual_arrival_at);

  const stopInputs: StopEtaInput[] = stops.map((s, i) => {
    const prev = i > 0 ? stops[i - 1] : null;
    const legMinutes =
      s.planned_arrival_at && prev?.planned_arrival_at
        ? Math.max(
            0,
            Math.round(
              (new Date(s.planned_arrival_at).getTime() - new Date(prev.planned_arrival_at).getTime()) / 60_000
            )
          )
        : 0;
    return {
      sequence: s.planned_sequence,
      stop_type: s.stop_type,
      legMinutes,
      actualArrivalAt: s.actual_arrival_at,
      actualDepartureAt: s.actual_departure_at,
    };
  });

  const started = stops.some((s) => s.actual_departure_at);
  const firstPlanned = stops[0].planned_arrival_at ?? departure.depart_at;
  const now = new Date();
  const anchor = started ? now : new Date(Math.max(now.getTime(), new Date(firstPlanned).getTime()));

  const risk = assessCheckinRisk(stopInputs, new Date(departure.crossing_checkin_deadline), anchor);
  return { risk, missingTimes };
}
