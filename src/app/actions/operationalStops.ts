"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { assessCheckinRisk, type StopEtaInput } from "@/lib/eta/estimateLegMinutes";
import type { StopPassengerRole, StopType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("operational_stops")
    .insert(input)
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${input.departure_id}`);
  return { success: true, id: data.id };
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
  const { data: stop } = await supabase
    .from("operational_stops")
    .select("locked, departure_id")
    .eq("id", id)
    .single();
  if (stop?.locked) return { error: "This stop is locked. Unlock it before editing." };

  const { error } = await supabase.from("operational_stops").update(input).eq("id", id);
  if (error) return { error: error.message };

  if (stop) revalidatePath(`/office/dispatch/${stop.departure_id}`);
  return { success: true };
}

export async function setStopLocked(id: string, locked: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("operational_stops").update({ locked }).eq("id", id);
  if (error) return { error: error.message };

  return { success: true };
}

export async function deleteStop(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: stop } = await supabase
    .from("operational_stops")
    .select("locked, departure_id")
    .eq("id", id)
    .single();
  if (stop?.locked) return { error: "This stop is locked. Unlock it before removing." };

  const { error } = await supabase.from("operational_stops").delete().eq("id", id);
  if (error) return { error: error.message };

  if (stop) revalidatePath(`/office/dispatch/${stop.departure_id}`);
  return { success: true };
}

/**
 * Manual reorder (build spec §20: "Office can: drag stops..."). Takes the
 * full ordered list of stop IDs for a departure and reassigns
 * planned_sequence 0..n-1 to match — simpler and less error-prone than a
 * single-position move, and matches how a drag-and-drop UI naturally
 * reports its result (the whole new order).
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
 * the plain-HTML-forms equivalent of a drag handle, so the dispatch board
 * works without shipping a drag-and-drop library for a first pass.
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
  if (neighbourIndex < 0 || neighbourIndex >= (stops?.length ?? 0)) return { success: true };

  const current = stops![index];
  const neighbour = stops![neighbourIndex];
  if (current.locked || neighbour.locked) {
    return { error: "One of these stops is locked." };
  }

  const { error: e1 } = await supabase
    .from("operational_stops")
    .update({ planned_sequence: neighbour.planned_sequence })
    .eq("id", current.id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase
    .from("operational_stops")
    .update({ planned_sequence: current.planned_sequence })
    .eq("id", neighbour.id);
  if (e2) return { error: e2.message };

  revalidatePath(`/office/dispatch/${departureId}`);
  return { success: true };
}

/**
 * Groups a passenger's pickup or drop-off into an existing stop (build
 * spec §20: "Multiple requirements at one address group into a single
 * stop — Office confirms grouping, never automatic"). This action IS the
 * confirmation - nothing groups passengers without Office calling it.
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

/**
 * Suggests one stop per distinct pickup/drop-off address among a
 * departure's confirmed+provisional passengers, as a starting point Office
 * reviews and adjusts (reorder/regroup/remove) afterward via the actions
 * above — the suggestion itself is the "Office confirms grouping" step
 * (§20), since nothing groups until Office explicitly triggers this and
 * then edits the result; it never runs on its own when a booking is made.
 * Skips a departure that already has stops, so it can't be run twice and
 * duplicate everything.
 */
export async function generateStopsFromBookings(departureId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { count: existingCount } = await supabase
    .from("operational_stops")
    .select("id", { count: "exact", head: true })
    .eq("departure_id", departureId);
  if (existingCount && existingCount > 0) {
    return { error: "This departure already has stops - remove them first or adjust manually." };
  }

  const { data: rows, error } = await supabase
    .from("booking_passengers")
    .select("id, pickup_address_id, dropoff_address_id, status, bookings!inner(departure_id)")
    .eq("bookings.departure_id", departureId)
    .in("status", ["provisional", "deposit_pending", "confirmed"]);
  if (error) return { error: error.message };

  const byPickup = new Map<string, string[]>();
  const byDropoff = new Map<string, string[]>();
  for (const row of rows ?? []) {
    if (row.pickup_address_id) {
      byPickup.set(row.pickup_address_id, [...(byPickup.get(row.pickup_address_id) ?? []), row.id]);
    }
    if (row.dropoff_address_id) {
      byDropoff.set(row.dropoff_address_id, [...(byDropoff.get(row.dropoff_address_id) ?? []), row.id]);
    }
  }

  let sequence = 0;
  for (const [addressId, bpIds] of byPickup) {
    const { data: stop, error: stopError } = await supabase
      .from("operational_stops")
      .insert({
        departure_id: departureId,
        address_id: addressId,
        stop_type: "pickup",
        planned_sequence: sequence++,
        passengers_expected: bpIds.length,
      })
      .select("id")
      .single();
    if (stopError) return { error: stopError.message };
    await supabase
      .from("operational_stop_passengers")
      .insert(bpIds.map((bpId) => ({ operational_stop_id: stop.id, booking_passenger_id: bpId, role: "pickup" as const })));
  }
  for (const [addressId, bpIds] of byDropoff) {
    const { data: stop, error: stopError } = await supabase
      .from("operational_stops")
      .insert({
        departure_id: departureId,
        address_id: addressId,
        stop_type: "dropoff",
        planned_sequence: sequence++,
        passengers_expected: bpIds.length,
      })
      .select("id")
      .single();
    if (stopError) return { error: stopError.message };
    await supabase
      .from("operational_stop_passengers")
      .insert(bpIds.map((bpId) => ({ operational_stop_id: stop.id, booking_passenger_id: bpId, role: "dropoff" as const })));
  }

  revalidatePath(`/office/dispatch/${departureId}`);
  return { success: true };
}

/**
 * Build spec §20: "The system warns when projected arrival risks missing
 * the crossing check-in deadline." Pulls the departure's stops and
 * crossing_checkin_deadline, then delegates the actual projection to the
 * pure assessCheckinRisk() function so it stays unit-testable.
 */
export async function getCheckinWarning(departureId: string) {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const [{ data: departure }, { data: stops }] = await Promise.all([
    supabase.from("departures").select("crossing_checkin_deadline").eq("id", departureId).single(),
    supabase
      .from("operational_stops")
      .select("planned_sequence, stop_type, planned_arrival_at, actual_arrival_at, actual_departure_at")
      .eq("departure_id", departureId)
      .order("planned_sequence", { ascending: true }),
  ]);

  if (!departure?.crossing_checkin_deadline || !stops || stops.length === 0) {
    return { risk: null };
  }

  // legMinutes derived from consecutive planned_arrival_at values already
  // stored on each stop (set when the stop was created/templated), rather
  // than re-deriving from leg_timings/route_templates here - keeps this
  // read path simple and self-contained.
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

  const risk = assessCheckinRisk(stopInputs, new Date(departure.crossing_checkin_deadline));
  return { risk };
}
