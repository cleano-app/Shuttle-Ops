"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { DepartureDirection, DepartureStatus } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}

/**
 * Departures still open for booking (build spec §32's Booking Console
 * departure picker), with route names for display.
 */
export async function listBookableDepartures() {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", departures: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departures")
    .select("id, direction, depart_at, status, seats_capacity, seats_released, route_id, routes(name)")
    .in("status", ["draft", "published", "boarding"])
    .order("depart_at", { ascending: true });
  if (error) return { error: error.message, departures: [] };

  return { departures: data ?? [] };
}

/**
 * Live capacity display for the Booking Console (build spec §32) — reads
 * departure_capacity_summary (0020_departure_capacity_summary.sql), a
 * read-only view over the same source rows allocate_booking_capacity()
 * itself recomputes from. This is a display convenience only; the Postgres
 * function remains the sole source of truth for whether a booking is
 * actually allowed.
 */
export async function getDepartureCapacitySummary(departureId: string) {
  const session = await getSession();
  if (!session || !isOfficeForSummary(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departure_capacity_summary")
    .select("*")
    .eq("departure_id", departureId)
    .maybeSingle();
  if (error) return { error: error.message };

  return { summary: data };
}

// departure_capacity_summary is Office-only (it joins booking_passengers,
// which has no dispatcher/driver RLS policy — see 0020's comment), so this
// check is narrower than isDispatcherOrAbove used elsewhere in this file.
function isOfficeForSummary(role: string) {
  return role === "admin" || role === "office";
}

export async function createDeparture(input: {
  route_id: string;
  direction: DepartureDirection;
  depart_at: string;
  arrive_estimate?: string | null;
  seats_capacity: number;
  hold_capacity_units?: number;
  wheelchair_capacity?: number;
  crossing_reference?: string | null;
  crossing_passenger_limit?: number | null;
  crossing_checkin_deadline?: string | null;
  notes?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departures")
    .insert({ ...input, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/office/departures");
  return { success: true, id: data.id };
}

export async function updateDeparture(
  id: string,
  input: Partial<{
    depart_at: string;
    arrive_estimate: string | null;
    seats_capacity: number;
    hold_capacity_units: number;
    wheelchair_capacity: number;
    crossing_reference: string | null;
    crossing_passenger_limit: number | null;
    crossing_cost_gbp: number | null;
    crossing_cost_eur: number | null;
    crossing_checkin_deadline: string | null;
    notes: string | null;
  }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("departures").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/office/departures/${id}`);
  revalidatePath("/office/departures");
  return { success: true };
}

/**
 * Office-controlled release of capacity (build spec §6). Validated against
 * seats_capacity by the table's own CHECK constraint
 * (0008_departures.sql) — this action just surfaces a friendlier error
 * than a raw Postgres constraint violation.
 */
export async function updateReleasedSeats(
  id: string,
  seatsReleased: number
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }
  if (seatsReleased < 0) return { error: "Released seats cannot be negative." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("departures")
    .update({ seats_released: seatsReleased })
    .eq("id", id);
  if (error) {
    if (error.message.includes("seats_released")) {
      return { error: "Released seats cannot exceed total seat capacity." };
    }
    return { error: error.message };
  }

  revalidatePath(`/office/departures/${id}`);
  revalidatePath("/office/booking-console");
  return { success: true };
}

/**
 * Optimistic-lock status transition — same pattern as Cleano Ops's
 * transitionJobStatus() in src/app/actions/jobStatus.ts: read the current
 * status, verify it equals `from`, then update. Backed redundantly by the
 * departures_dispatcher_manage RLS policy as a second enforcement layer.
 */
export async function transitionDepartureStatus(
  id: string,
  from: DepartureStatus,
  to: DepartureStatus
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!departure) return { error: "Departure not found." };
  if (departure.status !== from) {
    return {
      error: `Departure must be "${from}" to do this (currently "${departure.status}").`,
    };
  }

  const { error } = await supabase.from("departures").update({ status: to }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/office/departures/${id}`);
  revalidatePath("/office/departures");
  revalidatePath("/office/dashboard");
  return { success: true };
}
