"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/auth/portalSession";
import { computeFare } from "@/lib/tariffs/computeFare";
import { pickTariff, type TariffRow } from "@/lib/tariffs/pickTariff";
import { buildAddressSnapshot } from "@/lib/addresses/buildSnapshot";
import type {
  BookingPassengerInput,
  Currency,
  MyBookingSummary,
  MyPassengerProfile,
  OnlineBookingLeg,
  PassengerCategory,
} from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export interface OnlinePassengerLegInput {
  departureId: string;
  category: PassengerCategory;
  occupiesSeat: boolean;
  pickupAddressId: string;
  dropoffAddressId: string;
  luggage: { large: number; small: number; hand: number; oversize: number };
  wheelchairSpace?: boolean;
  mobilityNeeds?: string | null;
  currency: Currency;
}

async function buildLeg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  passengerId: string,
  leg: OnlinePassengerLegInput
): Promise<{ ok: true; value: OnlineBookingLeg } | { ok: false; error: string }> {
  const { data: departure } = await supabase
    .from("departures")
    .select("route_id, direction")
    .eq("id", leg.departureId)
    .single();
  if (!departure) return { ok: false, error: "Departure not found." };

  const { data: tariffs } = await supabase
    .from("tariffs")
    .select("*")
    .eq("route_id", departure.route_id)
    .eq("active", true);
  const tariff = pickTariff((tariffs ?? []) as TariffRow[], leg.category, departure.direction);
  if (!tariff) return { ok: false, error: "No pricing is set up for this route yet — please contact the office." };

  const fare = computeFare({
    tariff,
    currency: leg.currency,
    luggage: leg.luggage,
    // Self-service always pays the full notional fare — Office applies
    // any sponsorship/subsidy manually afterwards (build spec §1
    // principle 11: "money decisions stay human"). A passenger can never
    // set their own subsidy through this form.
    contribution: 0,
    sponsored: 0,
  });
  const contribution = fare.notionalFare;
  const finalFare = computeFare({
    tariff,
    currency: leg.currency,
    luggage: leg.luggage,
    contribution,
    sponsored: 0,
  });

  const [{ data: pickup }, { data: dropoff }] = await Promise.all([
    supabase.from("addresses").select("*").eq("id", leg.pickupAddressId).single(),
    supabase.from("addresses").select("*").eq("id", leg.dropoffAddressId).single(),
  ]);
  if (!pickup || !dropoff) return { ok: false, error: "Pickup or drop-off address not found." };

  const payload: BookingPassengerInput = {
    passenger_id: passengerId,
    category: leg.category,
    occupies_seat: leg.occupiesSeat,
    pickup_address_id: pickup.id,
    dropoff_address_id: dropoff.id,
    pickup_address_snapshot: buildAddressSnapshot(pickup) as unknown as Record<string, unknown>,
    dropoff_address_snapshot: buildAddressSnapshot(dropoff) as unknown as Record<string, unknown>,
    mobility_needs: leg.mobilityNeeds ?? null,
    wheelchair_space: leg.wheelchairSpace ?? false,
    currency: leg.currency,
    notional_fare: finalFare.notionalFare,
    contribution: finalFare.contribution,
    sponsored: finalFare.sponsored,
    subsidy: finalFare.subsidy,
    luggage_large: leg.luggage.large,
    luggage_small: leg.luggage.small,
    luggage_hand: leg.luggage.hand,
    luggage_oversize: leg.luggage.oversize,
    luggage_units_consumed: finalFare.luggageUnitsConsumed,
    luggage_charge: finalFare.luggageCharge,
    status: "provisional",
  };

  return { ok: true, value: { departure_id: leg.departureId, booking_passengers: [payload] } };
}

/**
 * Build spec Phase 5 (§39): the portal's "book a trip" flow. Every check
 * a phone/office booking gets (seats, crossing limit, hold, wheelchair,
 * unsecured cap, per-vehicle capacity) still applies — this only builds
 * the payload and calls create_online_trip_booking() (0048), which is a
 * thin, online-only wrapper around the SAME allocate_booking_capacity()
 * everything else uses. Live Take Payments isn't wired up (blocked on
 * merchant credentials, same as every other payment path in this app) —
 * the booking is created 'provisional' and the portal shows manual
 * deposit-payment instructions; Office reconciles the deposit by hand via
 * the existing recordDeposit action once it's received.
 */
export async function createOnlineBooking(input: {
  outbound: OnlinePassengerLegInput;
  return?: OnlinePassengerLegInput | null;
  notes?: string | null;
}): Promise<ActionResult & { reference?: string }> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger" || !session.passengerId) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();

  const outboundResult = await buildLeg(supabase, session.passengerId, input.outbound);
  if (!outboundResult.ok) return { error: outboundResult.error };

  let returnLeg: OnlineBookingLeg | null = null;
  if (input.return) {
    const returnResult = await buildLeg(supabase, session.passengerId, input.return);
    if (!returnResult.ok) return { error: returnResult.error };
    returnLeg = returnResult.value;
  }

  const { data, error } = await supabase.rpc("create_online_trip_booking", {
    p_outbound: { ...outboundResult.value, notes: input.notes ?? null },
    p_return: returnLeg,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/bookings");
  return { success: true, reference: (data as { reference: string }).reference };
}

export async function listMyBookings(): Promise<{ error?: string; bookings: MyBookingSummary[] }> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger") {
    return { error: "Not authorized.", bookings: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_bookings");
  if (error) return { error: error.message, bookings: [] };

  return { bookings: (data ?? []) as MyBookingSummary[] };
}

export async function getMyProfile(): Promise<{ error?: string; profile?: MyPassengerProfile }> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger") {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_passenger_profile");
  if (error) return { error: error.message };

  const profile = (data as MyPassengerProfile[] | null)?.[0];
  if (!profile) return { error: "Profile not found." };
  return { profile };
}

export async function updateMyProfile(input: {
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredLanguage: string | null;
  mobilityNeeds: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  defaultPickupAddressId?: string | null;
  defaultDropoffAddressId?: string | null;
}): Promise<ActionResult> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger") {
    return { error: "Not authorized." };
  }
  if (!input.fullName.trim()) {
    return { error: "Name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_passenger_profile", {
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_email: input.email,
    p_preferred_language: input.preferredLanguage,
    p_mobility_needs: input.mobilityNeeds,
    p_emergency_contact_name: input.emergencyContactName,
    p_emergency_contact_phone: input.emergencyContactPhone,
    p_default_pickup_address_id: input.defaultPickupAddressId ?? null,
    p_default_dropoff_address_id: input.defaultDropoffAddressId ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/profile");
  return { success: true };
}

/**
 * Build spec §11/§39: a passenger can REQUEST a cancellation of their own
 * booking; decided_outcome always stays null until Office reviews it —
 * requesting never cancels anything by itself.
 *
 * Routed through request_cancellation_online() (0053) rather than a
 * direct table insert — an earlier RLS-policy-based version of this
 * (0050) needed a SELECT policy on `bookings` for its own ownership
 * check to even evaluate (RLS subqueries run under the calling role, not
 * the function owner), and opening that up would have also exposed
 * bookings.notes (Office-authored) to any linked passenger. An RPC keeps
 * `bookings` closed and does the ownership check server-side instead —
 * caught by tests/integration/phase5.test.ts before this ever shipped.
 */
export async function requestCancellation(input: {
  bookingId: string;
  reasonText: string;
}): Promise<ActionResult> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger") {
    return { error: "Not authorized." };
  }
  if (!input.reasonText.trim()) {
    return { error: "Please tell us why you're cancelling." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_cancellation_online", {
    p_booking_id: input.bookingId,
    p_reason_text: input.reasonText,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/bookings");
  return { success: true };
}
