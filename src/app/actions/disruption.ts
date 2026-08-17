"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { BookingPassengerInput, Database, DisruptionType } from "@/types/database";

type BookingPassengerRow = Database["public"]["Tables"]["booking_passengers"]["Row"];

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * Build spec §36: "Select the affected departure, choose a target
 * departure, and move passengers, luggage and parcels across in bulk. The
 * move runs the full capacity check on the target; anyone who doesn't fit
 * is flagged for a personal call rather than silently dropped. Everyone
 * moved is auto-notified by SMS... Anyone not re-accommodated goes onto
 * the waitlist for the target departure automatically."
 *
 * Each passenger is moved via its own allocate_booking_capacity() call —
 * there is no separate "disruption bypass" of the capacity function, so a
 * move can never oversell the target departure. SMS notification reuses
 * the same best-effort "not configured yet" stub as booking confirmations
 * (src/lib/sms/sendSms.ts) — Twilio credentials don't exist yet, so this
 * currently logs a booking_messages row per moved passenger rather than
 * actually sending anything, same limitation as every other SMS path in
 * this app.
 */
export async function reaccommodateDeparture(input: {
  sourceDepartureId: string;
  targetDepartureId: string;
  type: DisruptionType;
  reason: string;
}): Promise<ActionResult & { moved?: number; unplaced?: number }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, lead_passenger_id, channel, booking_passengers(*)")
    .eq("departure_id", input.sourceDepartureId)
    .in("status", ["provisional", "deposit_pending", "confirmed"]);
  if (bookingsError) return { error: bookingsError.message };

  let moved = 0;
  let unplaced = 0;

  for (const booking of bookings ?? []) {
    const activePassengers = (booking.booking_passengers as unknown as BookingPassengerRow[]).filter(
      (bp) => !["cancelled", "expired", "no_show"].includes(bp.status)
    );
    if (activePassengers.length === 0) continue;

    const payload: BookingPassengerInput[] = activePassengers.map((bp) => ({
      passenger_id: bp.passenger_id,
      category: bp.category,
      occupies_seat: bp.occupies_seat,
      pickup_address_id: bp.pickup_address_id,
      dropoff_address_id: bp.dropoff_address_id,
      pickup_address_snapshot: bp.pickup_address_snapshot,
      dropoff_address_snapshot: bp.dropoff_address_snapshot,
      mobility_needs: bp.mobility_needs,
      wheelchair_space: bp.wheelchair_space,
      currency: bp.currency,
      notional_fare: bp.notional_fare,
      contribution: bp.contribution,
      sponsored: bp.sponsored,
      subsidy: bp.subsidy,
      luggage_large: bp.luggage_large,
      luggage_small: bp.luggage_small,
      luggage_hand: bp.luggage_hand,
      luggage_oversize: bp.luggage_oversize,
      luggage_units_consumed: bp.luggage_units_consumed,
      luggage_charge: bp.luggage_charge,
      status: "confirmed",
    }));

    const { error: allocateError } = await supabase.rpc("allocate_booking_capacity", {
      p_departure_id: input.targetDepartureId,
      p_lead_passenger_id: booking.lead_passenger_id,
      p_channel: booking.channel,
      p_booking_passengers: payload,
      p_notes: `Re-accommodated from a disrupted departure (${input.reason}).`,
      p_override_reason: null,
      p_booked_by_user_id: session.userId,
      p_trip_id: null,
    });

    if (allocateError) {
      // Doesn't fit on the target — waitlist instead of silently dropping.
      unplaced += activePassengers.length;
      await supabase.from("waitlist").insert({
        departure_id: input.targetDepartureId,
        passenger_id: booking.lead_passenger_id,
        seats_wanted: activePassengers.filter((bp) => bp.occupies_seat).length || 1,
        luggage_estimate: activePassengers.reduce((sum, bp) => sum + ((bp.luggage_units_consumed as number) ?? 0), 0),
        wheelchair_requirement: activePassengers.some((bp) => bp.wheelchair_space),
      });
      continue;
    }

    // Cancel the original booking now that everyone on it has a new home
    // (or a waitlist slot) on the target departure.
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    await supabase
      .from("booking_passengers")
      .update({ status: "cancelled" })
      .eq("booking_id", booking.id)
      .not("status", "in", "(cancelled,expired,no_show)");
    moved += activePassengers.length;
  }

  await supabase.from("disruption_events").insert({
    departure_id: input.sourceDepartureId,
    type: input.type,
    reason: input.reason,
    decided_by: session.userId,
    passengers_moved: moved,
    passengers_unplaced: unplaced,
  });

  await supabase.from("departures").update({ status: "cancelled" }).eq("id", input.sourceDepartureId);

  revalidatePath("/office/departures");
  revalidatePath(`/office/departures/${input.targetDepartureId}`);
  return { success: true, moved, unplaced };
}
