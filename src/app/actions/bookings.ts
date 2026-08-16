"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type {
  AllocateBookingLeg,
  AllocateBookingResult,
  AllocateTripResult,
  BookingStatus,
} from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/** Postgres error.message set by allocate_booking_capacity()/
 * allocate_trip_capacity() (0018_capacity_allocation_fn.sql) — surfaced
 * verbatim by the Supabase client as error.message, so this just narrows
 * the type for callers that want to branch on the failure code. */
function extractRpcErrorMessage(error: { message: string } | null): string | undefined {
  return error?.message;
}

/** Single-leg provisional booking. */
export async function createProvisionalBooking(input: {
  leadPassengerId: string;
  leg: AllocateBookingLeg;
}): Promise<ActionResult & { result?: AllocateBookingResult }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("allocate_booking_capacity", {
    p_departure_id: input.leg.departure_id,
    p_lead_passenger_id: input.leadPassengerId,
    p_channel: input.leg.channel,
    p_booking_passengers: input.leg.booking_passengers,
    p_notes: input.leg.notes ?? null,
    p_override_reason: input.leg.override_reason ?? null,
    p_booked_by_user_id: session.userId,
  });
  if (error) return { error: extractRpcErrorMessage(error) };

  revalidatePath("/office/booking-console");
  revalidatePath(`/office/departures/${input.leg.departure_id}`);
  return { success: true, result: data as AllocateBookingResult };
}

/**
 * Round-trip provisional booking — THE action the Booking Console's
 * single Reserve button calls (build spec §32: "One action provisionally
 * reserves the required capacity."). Both legs succeed or neither does
 * (allocate_trip_capacity() runs both inside one Postgres transaction).
 */
export async function createProvisionalTripBooking(input: {
  leadPassengerId: string;
  outbound: AllocateBookingLeg;
  return?: AllocateBookingLeg | null;
}): Promise<ActionResult & { result?: AllocateTripResult }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("allocate_trip_capacity", {
    p_lead_passenger_id: input.leadPassengerId,
    p_outbound: input.outbound,
    p_return: input.return ?? null,
    p_booked_by_user_id: session.userId,
  });
  if (error) return { error: extractRpcErrorMessage(error) };

  revalidatePath("/office/booking-console");
  revalidatePath(`/office/departures/${input.outbound.departure_id}`);
  if (input.return) revalidatePath(`/office/departures/${input.return.departure_id}`);
  return { success: true, result: data as AllocateTripResult };
}

async function transitionBookingPassengerStatus(
  id: string,
  from: BookingStatus[],
  to: BookingStatus,
  extra?: Record<string, unknown>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("booking_passengers")
    .select("id, status, booking_id")
    .eq("id", id)
    .single();

  if (!row) return { error: "Booking passenger not found." };
  if (!from.includes(row.status)) {
    return { error: `Must be one of ${from.join("/")} to do this (currently "${row.status}").` };
  }

  const { error } = await supabase
    .from("booking_passengers")
    .update({ status: to, ...extra })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/booking-console");
  return { success: true };
}

export async function confirmBookingPassenger(id: string): Promise<ActionResult> {
  return transitionBookingPassengerStatus(id, ["provisional", "deposit_pending"], "confirmed");
}

export async function cancelBookingPassenger(id: string): Promise<ActionResult> {
  return transitionBookingPassengerStatus(
    id,
    ["provisional", "deposit_pending", "confirmed"],
    "cancelled"
  );
}

export async function markNoShow(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("booking_passengers")
    .select("id, status, passenger_id")
    .eq("id", id)
    .single();
  if (!row) return { error: "Booking passenger not found." };
  if (row.status !== "confirmed") {
    return { error: `Must be "confirmed" to mark a no-show (currently "${row.status}").` };
  }

  const { error } = await supabase
    .from("booking_passengers")
    .update({ status: "no_show", no_show: true })
    .eq("id", id);
  if (error) return { error: error.message };

  // Build spec §11: no automatic charge — just increment the count so a
  // review task can be created once a configurable threshold is crossed
  // (that threshold/task is Phase 2 hardening, not built yet).
  const { data: passenger } = await supabase
    .from("passengers")
    .select("no_show_count")
    .eq("id", row.passenger_id)
    .single();
  if (passenger) {
    await supabase
      .from("passengers")
      .update({ no_show_count: passenger.no_show_count + 1 })
      .eq("id", row.passenger_id);
  }

  revalidatePath("/office/booking-console");
  return { success: true };
}

/**
 * Lazy expiry sweep — same pattern as Cleano Ops's booking-request expiry:
 * computed at read-time from provisional_expires_at rather than a cron job.
 * Called from the booking console and departure detail page on load.
 */
export async function expireStaleProvisionalBookings(departureId?: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select("id, departure_id")
    .eq("status", "provisional")
    .lt("provisional_expires_at", new Date().toISOString());
  if (departureId) query = query.eq("departure_id", departureId);

  const { data: staleBookings, error } = await query;
  if (error) return { error: error.message };
  if (!staleBookings || staleBookings.length === 0) return { success: true };

  const ids = staleBookings.map((b) => b.id);
  await supabase.from("bookings").update({ status: "expired" }).in("id", ids);
  await supabase
    .from("booking_passengers")
    .update({ status: "expired" })
    .in("booking_id", ids)
    .in("status", ["provisional", "deposit_pending"]);

  revalidatePath("/office/booking-console");
  return { success: true };
}
