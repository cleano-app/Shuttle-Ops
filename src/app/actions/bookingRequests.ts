"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { emailConfigured, sendEmail } from "@/lib/email/sendEmail";
import { formatUk } from "@/lib/time";
import { journeyEnds, placeStyle } from "@/lib/places";
import { journeyLabel } from "@/lib/journey";
import { computeFare } from "@/lib/tariffs/computeFare";
import { pickTariff, type TariffRow } from "@/lib/tariffs/pickTariff";
import { buildAddressSnapshot, type AddressLike } from "@/lib/addresses/buildSnapshot";
import { createPassenger } from "@/app/actions/passengers";
import { createAddress } from "@/app/actions/addresses";
import { createProvisionalTripBooking } from "@/app/actions/bookings";
import { addToWaitlist } from "@/app/actions/waitlist";
import {
  capacityMessage,
  isWaitlistable,
  parseCapacityCode,
} from "@/components/office/booking/capacityMessages";
import {
  luggageText,
  partyMembers,
  partyText,
  requestProblems,
  seatsNeeded,
  submitErrorMessage,
  type RequestInput,
} from "@/components/book/request";
import type {
  AllocateBookingLeg,
  BookingPassengerInput,
  BookingRequestRow,
  Currency,
  DepartureDirection,
  PublicDepartureAvailability,
} from "@/types/database";

// Public booking requests (/book) and Office's handling of them
// (/office/requests). The public side only ever calls
// submit_booking_request() (0063), which validates and rate-limits in the
// database; it never creates passengers, bookings or deposits. Office turns
// a request into a real provisional booking here, as the signed-in office
// user, through the same actions the Booking Console uses.

export interface SubmitResult {
  ok?: boolean;
  reference?: string;
  error?: string;
  problems?: string[];
}

export async function submitBookingRequest(input: RequestInput): Promise<SubmitResult> {
  const problems = requestProblems(input);
  if (problems.length) return { problems };

  const supabase = await createClient();
  const outboundId = input.outboundDepartureId!;
  const returnId = input.wantsReturn ? input.returnDepartureId : null;
  const { data, error } = await supabase.rpc("submit_booking_request", {
    p: {
      direction: input.direction,
      outbound_departure_id: outboundId,
      return_departure_id: returnId,
      men: input.party.men,
      women: input.party.women,
      boys: input.party.boys,
      girls: input.party.girls,
      infants: input.party.infants,
      luggage_large: input.luggage.large,
      luggage_small: input.luggage.small,
      luggage_hand: input.luggage.hand,
      pickup_line1: input.pickup.line1,
      pickup_postcode: input.pickup.postcode,
      pickup_city: input.pickup.city,
      dropoff_line1: input.dropoff.line1,
      dropoff_postcode: input.dropoff.postcode,
      dropoff_city: input.dropoff.city,
      mobility_needs: input.mobilityNeeds,
      contact_name: input.name,
      contact_phone: input.phone,
      contact_email: input.email,
      preferred_language: input.language,
      notes: input.notes,
    },
  });
  if (error || !data) {
    if (error) console.error("[book] submit_booking_request failed:", error.message);
    return { error: submitErrorMessage(error?.message) };
  }
  const reference = data as string;

  // Acknowledgement email: best effort only, never fails the request.
  const email = input.email.trim();
  if (email && emailConfigured()) {
    try {
      const legs = await Promise.all(
        [outboundId, returnId].filter(Boolean).map(async (id) => {
          const { data: rows } = await supabase.rpc("get_public_departure_availability", { p_departure_id: id! });
          const d = (rows as PublicDepartureAvailability[] | null)?.[0];
          return d ? `${journeyLabel(d.route_name, d.direction)}: ${formatUk(d.depart_at, { date: "full", time: "short" })}` : null;
        })
      );
      await sendEmail({
        to: [email],
        subject: `We've got your booking request (${reference})`,
        text: [
          `Hello ${input.name.trim()},`,
          "",
          `Thank you — we've received your booking request. Your reference is ${reference}.`,
          "",
          ...legs.filter(Boolean),
          `Travelling: ${partyText(input.party)}`,
          `Luggage: ${luggageText(input.luggage)}`,
          "",
          "This is a request, not a confirmed booking yet. We'll call you to confirm your seats and take the deposit.",
          "",
          "If anything changes, just reply to this email or call the office and quote your reference.",
        ].join("\n"),
      });
    } catch (e) {
      console.error("[book] acknowledgement email failed:", e instanceof Error ? e.message : e);
    }
  }

  revalidatePath("/office/requests");
  return { ok: true, reference };
}

// ---------------------------------------------------------------------------
// Office side
// ---------------------------------------------------------------------------

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

export interface RequestDeparture {
  id: string;
  route_id: string;
  direction: DepartureDirection;
  depart_at: string;
  status: string;
  route_name: string | null;
}

async function loadDepartures(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<Map<string, RequestDeparture>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("departures")
    .select("id, route_id, direction, depart_at, status, routes(name)")
    .in("id", ids);
  const rows = (data ?? []) as unknown as (Omit<RequestDeparture, "route_name"> & { routes?: { name?: string } | null })[];
  return new Map(rows.map((d) => [d.id, { ...d, route_name: d.routes?.name ?? null }]));
}

export async function listBookingRequests(): Promise<{
  error?: string;
  pending: BookingRequestRow[];
  handled: BookingRequestRow[];
  departures: Map<string, RequestDeparture>;
}> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized.", pending: [], handled: [], departures: new Map() };
  }
  const supabase = await createClient();
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [pending, handled] = await Promise.all([
    supabase.from("booking_requests").select("*").eq("status", "pending").order("created_at", { ascending: true }),
    supabase
      .from("booking_requests")
      .select("*")
      .neq("status", "pending")
      .gte("handled_at", since)
      .order("handled_at", { ascending: false })
      .limit(30),
  ]);
  const error = pending.error?.message ?? handled.error?.message;
  const all = [...(pending.data ?? []), ...(handled.data ?? [])] as BookingRequestRow[];
  const ids = [...new Set(all.flatMap((r) => [r.outbound_departure_id, r.return_departure_id].filter(Boolean) as string[]))];
  const departures = await loadDepartures(supabase, ids);
  return {
    error,
    pending: (pending.data ?? []) as BookingRequestRow[],
    handled: (handled.data ?? []) as BookingRequestRow[],
    departures,
  };
}

export interface ConvertResult {
  error?: string;
  success?: boolean;
  message?: string;
  /** The booking couldn't be made for lack of space: offer the waitlist. */
  waitlist?: boolean;
  departureId?: string;
}

/** Area for a new address: the first active one in that country, or none. */
async function firstAreaIn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  country: string
): Promise<string | null> {
  if (country === "unknown") return null;
  const { data } = await supabase
    .from("areas")
    .select("id")
    .eq("country", country)
    .eq("active", true)
    .order("running_order", { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

export async function convertBookingRequest(_prev: ConvertResult | null, formData: FormData): Promise<ConvertResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) return { error: "Not authorized." };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: reqRow, error: reqError } = await supabase.from("booking_requests").select("*").eq("id", id).single();
  if (reqError || !reqRow) return { error: reqError?.message ?? "Request not found." };
  const req = reqRow as BookingRequestRow;
  if (req.status !== "pending") return { error: `This request is already ${req.status}.` };

  const deps = await loadDepartures(
    supabase,
    [req.outbound_departure_id, req.return_departure_id].filter(Boolean) as string[]
  );
  const outbound = deps.get(req.outbound_departure_id);
  const ret = req.return_departure_id ? deps.get(req.return_departure_id) : null;
  if (!outbound) return { error: "The requested departure no longer exists." };
  if (req.return_departure_id && !ret) return { error: "The requested return departure no longer exists." };

  const party = { men: req.men, women: req.women, boys: req.boys, girls: req.girls, infants: req.infants };
  const members = partyMembers(req.contact_name, party);

  // 1. Passengers (reused on a retry).
  let passengerIds = req.passenger_ids ?? [];
  if (!req.lead_passenger_id || passengerIds.length !== members.length) {
    passengerIds = [];
    for (const m of members) {
      const res = await createPassenger({
        full_name: m.name,
        category: m.category,
        phone: m.lead ? req.contact_phone : null,
        email: m.lead ? req.contact_email : null,
        preferred_language: m.lead ? req.preferred_language : null,
        mobility_needs: m.lead ? req.mobility_needs : null,
        created_via: "online",
      });
      if (res.error || !res.id) return { error: `Couldn't create passenger "${m.name}": ${res.error ?? "unknown error"}` };
      passengerIds.push(res.id);
    }
    const { error } = await supabase
      .from("booking_requests")
      .update({ lead_passenger_id: passengerIds[0], passenger_ids: passengerIds })
      .eq("id", req.id);
    if (error) return { error: `Passengers created, but the request couldn't be updated: ${error.message}` };
  }
  const leadId = passengerIds[0];

  // 2. Addresses (reused on a retry). Pick-up is at the start of the
  // outbound journey, drop-off at its end.
  const ends = journeyEnds(outbound.route_name, outbound.direction);
  const fromCountry = ends ? placeStyle(ends[0]).country : "unknown";
  const toCountry = ends ? placeStyle(ends[1]).country : "unknown";
  let pickupId = req.pickup_address_id;
  let dropoffId = req.dropoff_address_id;
  if (!pickupId) {
    const res = await createAddress({
      line1: req.pickup_line1,
      city: req.pickup_city,
      postcode: req.pickup_postcode,
      country: fromCountry === "unknown" ? "GB" : fromCountry,
      area_id: await firstAreaIn(supabase, fromCountry),
      address_type: "residential",
    });
    if (res.error || !res.id) return { error: `Couldn't create the pick-up address: ${res.error ?? "unknown error"}` };
    pickupId = res.id;
  }
  if (!dropoffId) {
    const res = await createAddress({
      line1: req.dropoff_line1,
      city: req.dropoff_city,
      postcode: req.dropoff_postcode,
      country: toCountry === "unknown" ? "GB" : toCountry,
      area_id: await firstAreaIn(supabase, toCountry),
      address_type: "residential",
    });
    if (res.error || !res.id) return { error: `Couldn't create the drop-off address: ${res.error ?? "unknown error"}` };
    dropoffId = res.id;
  }
  if (pickupId !== req.pickup_address_id || dropoffId !== req.dropoff_address_id) {
    const { error } = await supabase
      .from("booking_requests")
      .update({ pickup_address_id: pickupId, dropoff_address_id: dropoffId })
      .eq("id", req.id);
    if (error) return { error: `Addresses created, but the request couldn't be updated: ${error.message}` };
  }

  const { data: addrRows, error: addrError } = await supabase
    .from("addresses")
    .select("*")
    .in("id", [pickupId, dropoffId]);
  if (addrError) return { error: addrError.message };
  const pickup = (addrRows ?? []).find((a) => a.id === pickupId) as AddressLike | undefined;
  const dropoff = (addrRows ?? []).find((a) => a.id === dropoffId) as AddressLike | undefined;
  if (!pickup || !dropoff) return { error: "Couldn't read back the new addresses." };
  const pickupSnap = buildAddressSnapshot(pickup) as unknown as Record<string, unknown>;
  const dropoffSnap = buildAddressSnapshot(dropoff) as unknown as Record<string, unknown>;

  // 3. Fares at the full tariff, deposit required — Office adjusts any
  // subsidy or waiver on the departure afterwards (money decisions stay
  // human). The party's luggage is all put on the lead passenger.
  const { data: tariffRows, error: tariffError } = await supabase
    .from("tariffs")
    .select("*")
    .eq("route_id", outbound.route_id)
    .eq("active", true);
  if (tariffError) return { error: tariffError.message };
  const tariffs = (tariffRows ?? []) as unknown as TariffRow[];
  const currency: Currency = fromCountry === "BE" || fromCountry === "NL" || fromCountry === "FR" ? "EUR" : "GBP";
  const note = [`Online request ${req.reference}`, req.notes].filter(Boolean).join(" — ");

  function leg(departure: RequestDeparture, reversed: boolean): AllocateBookingLeg {
    const booking_passengers: BookingPassengerInput[] = members.map((m, i) => {
      const luggage = m.lead
        ? { large: req.luggage_large, small: req.luggage_small, hand: req.luggage_hand, oversize: 0 }
        : { large: 0, small: 0, hand: 0, oversize: 0 };
      const tariff = pickTariff(tariffs, m.category, departure.direction);
      const base = tariff ? computeFare({ tariff, currency, luggage, contribution: 0, sponsored: 0 }) : null;
      const fare = tariff
        ? computeFare({ tariff, currency, luggage, contribution: base!.notionalFare, sponsored: 0 })
        : { notionalFare: 0, contribution: 0, sponsored: 0, subsidy: 0, luggageCharge: 0, luggageUnitsConsumed: 0 };
      return {
        passenger_id: passengerIds[i],
        category: m.category,
        occupies_seat: m.occupiesSeat,
        pickup_address_id: reversed ? dropoffId : pickupId,
        dropoff_address_id: reversed ? pickupId : dropoffId,
        pickup_address_snapshot: reversed ? dropoffSnap : pickupSnap,
        dropoff_address_snapshot: reversed ? pickupSnap : dropoffSnap,
        mobility_needs: m.lead ? req.mobility_needs : null,
        wheelchair_space: false,
        currency,
        notional_fare: fare.notionalFare,
        contribution: fare.contribution,
        sponsored: fare.sponsored,
        subsidy: fare.subsidy,
        deposit_required: true,
        deposit_status: "required",
        luggage_large: luggage.large,
        luggage_small: luggage.small,
        luggage_hand: luggage.hand,
        luggage_oversize: 0,
        luggage_units_consumed: fare.luggageUnitsConsumed,
        luggage_charge: fare.luggageCharge,
        status: "provisional",
      };
    });
    return { departure_id: departure.id, channel: "online", booking_passengers, notes: note };
  }

  // 4. The booking itself — same capacity checks as the console.
  const result = await createProvisionalTripBooking({
    leadPassengerId: leadId,
    outbound: leg(outbound, false),
    return: ret ? leg(ret, true) : null,
  });
  if (result.error || !result.result) {
    const code = parseCapacityCode(result.error);
    if (code && isWaitlistable(code)) {
      return { error: capacityMessage(code), waitlist: true };
    }
    return { error: code ? capacityMessage(code) : (result.error ?? "The booking couldn't be made.") };
  }

  const reference = result.result.reference;
  const { error: markError } = await supabase
    .from("booking_requests")
    .update({
      status: "converted",
      converted_booking_reference: reference,
      handled_by: session.userId,
      handled_at: new Date().toISOString(),
    })
    .eq("id", req.id);
  revalidatePath("/office/requests");
  revalidatePath("/office/dashboard");
  if (markError) {
    return {
      success: true,
      departureId: outbound.id,
      message: `Booked ${reference}, but the request couldn't be marked as done: ${markError.message}`,
    };
  }
  return {
    success: true,
    departureId: outbound.id,
    message: `Booked ${reference} — provisional, deposit to take.`,
  };
}

export async function waitlistBookingRequest(_prev: ConvertResult | null, formData: FormData): Promise<ConvertResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) return { error: "Not authorized." };
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: reqRow, error: reqError } = await supabase.from("booking_requests").select("*").eq("id", id).single();
  if (reqError || !reqRow) return { error: reqError?.message ?? "Request not found." };
  const req = reqRow as BookingRequestRow;
  if (req.status !== "pending") return { error: `This request is already ${req.status}.` };
  if (!req.lead_passenger_id) return { error: "Press Create booking first, so the passengers exist." };

  const party = { men: req.men, women: req.women, boys: req.boys, girls: req.girls, infants: req.infants };
  for (const departureId of [req.outbound_departure_id, req.return_departure_id].filter(Boolean) as string[]) {
    const res = await addToWaitlist({
      departureId,
      passengerId: req.lead_passenger_id,
      seatsWanted: Math.max(1, seatsNeeded(party)),
      luggageEstimate: req.luggage_large + req.luggage_small,
      wheelchairRequirement: false,
    });
    if (res.error) return { error: `Couldn't add to the waitlist: ${res.error}` };
  }

  const { error } = await supabase
    .from("booking_requests")
    .update({ status: "waitlisted", handled_by: session.userId, handled_at: new Date().toISOString() })
    .eq("id", req.id);
  if (error) return { error: `Added to the waitlist, but the request couldn't be updated: ${error.message}` };
  revalidatePath("/office/requests");
  revalidatePath("/office/dashboard");
  return { success: true, message: "Added to the waitlist.", departureId: req.outbound_departure_id };
}

export async function declineBookingRequest(
  _prev: { error?: string; success?: boolean; message?: string } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean; message?: string }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) return { error: "Not authorized." };
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Give a reason for declining." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_requests")
    .update({
      status: "declined",
      decline_reason: reason.slice(0, 500),
      handled_by: session.userId,
      handled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "This request was already handled." };
  revalidatePath("/office/requests");
  revalidatePath("/office/dashboard");
  return { success: true, message: "Declined." };
}
