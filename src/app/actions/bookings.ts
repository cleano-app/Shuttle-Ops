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

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Waiver rows for passengers booked with deposit_status "waived" and no
 * waiver yet (standing waivers and one-off ticks in the console). */
async function recordBookingTimeWaivers(
  supabase: ServerClient,
  bookingIds: string[],
  userId: string
): Promise<string | null> {
  if (bookingIds.length === 0) return null;
  const { data: rows, error } = await supabase
    .from("booking_passengers")
    .select("id, passengers(deposit_waiver_standing)")
    .in("booking_id", bookingIds)
    .eq("deposit_status", "waived")
    .is("waiver_id", null);
  if (error) return error.message;
  for (const row of rows ?? []) {
    const standing = (row as unknown as { passengers?: { deposit_waiver_standing?: boolean } }).passengers
      ?.deposit_waiver_standing;
    const { data: waiver, error: insertError } = await supabase
      .from("waivers")
      .insert({
        booking_passenger_id: row.id,
        reason_code: standing ? "standing_waiver" : "waived_at_booking",
        granted_by_user_id: userId,
      })
      .select("id")
      .single();
    if (insertError) return insertError.message;
    const { error: linkError } = await supabase
      .from("booking_passengers")
      .update({ waiver_id: waiver.id })
      .eq("id", row.id);
    if (linkError) return linkError.message;
  }
  return null;
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

  const result = data as AllocateBookingResult;
  const waiverError = await recordBookingTimeWaivers(supabase, [result.booking_id], session.userId);
  if (waiverError) {
    return { error: `Booked (${result.reference}), but the waiver could not be recorded: ${waiverError}` };
  }

  revalidatePath("/office/booking-console");
  revalidatePath(`/office/departures/${input.leg.departure_id}`);
  return { success: true, result };
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

  const result = data as AllocateTripResult;
  // A deposit waived at booking time is still an Office decision with a
  // named decision-maker (spec §10) — record the waiver row for it.
  const bookingIds = [result.outbound?.booking_id, result.return?.booking_id].filter(Boolean) as string[];
  const waiverError = await recordBookingTimeWaivers(supabase, bookingIds, session.userId);
  if (waiverError) {
    return { error: `Booked (${result.reference}), but the waiver could not be recorded: ${waiverError}` };
  }

  revalidatePath("/office/booking-console");
  revalidatePath(`/office/departures/${input.outbound.departure_id}`);
  if (input.return) revalidatePath(`/office/departures/${input.return.departure_id}`);
  return { success: true, result };
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
    .select("id, status, booking_id, deposit_status, bookings(departure_id)")
    .eq("id", id)
    .single();

  if (!row) return { error: "Booking passenger not found." };
  if (!from.includes(row.status)) {
    return { error: `Must be one of ${from.join("/")} to do this (currently "${row.status}").` };
  }
  // Spec §1.3: confirmation needs the deposit secured or an approved waiver.
  if (to === "confirmed" && !["secured", "waived", "not_required"].includes(row.deposit_status)) {
    return { error: "Take the deposit or waive it before confirming." };
  }

  const { error } = await supabase
    .from("booking_passengers")
    .update({ status: to, ...extra })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/booking-console");
  const departureId = (row as unknown as { bookings?: { departure_id?: string } }).bookings?.departure_id;
  if (departureId) revalidatePath(`/office/departures/${departureId}`);
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
  revalidatePath("/office/departures/[id]", "page");
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
    .in("status", ["provisional", "deposit_pending"])
    .lt("provisional_expires_at", new Date().toISOString());
  if (departureId) query = query.eq("departure_id", departureId);

  const { data: staleBookings, error } = await query;
  if (error) return { error: error.message };
  if (!staleBookings || staleBookings.length === 0) return { success: true };

  // Only passengers still unsecured expire; the booking row follows its
  // passengers (trigger, migration 0056). No revalidatePath here: this runs
  // while the booking console and departure pages render, which Next
  // forbids, and those pages read the data after calling it anyway.
  const ids = staleBookings.map((b) => b.id);
  const { error: expireError } = await supabase
    .from("booking_passengers")
    .update({ status: "expired" })
    .in("booking_id", ids)
    .in("status", ["provisional", "deposit_pending"])
    .not("deposit_status", "in", "(secured,waived)");
  if (expireError) return { error: expireError.message };

  return { success: true };
}
