"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { Currency, ParcelBookingInput, ParcelSizeCategory } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}
function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}

/**
 * Build spec §15: parcels share physical hold capacity with passenger
 * luggage. Runs through allocate_parcel_capacity() (0037), which locks
 * the departure row and checks the SAME shared hold_capacity_units pool
 * that allocate_booking_capacity() checks — never a separate limit.
 */
export async function createParcelBooking(input: {
  departureId: string;
  senderName: string;
  senderPhone?: string | null;
  senderAddressId?: string | null;
  recipientName: string;
  recipientPhone?: string | null;
  recipientAddressId?: string | null;
  quantity?: number;
  sizeCategory: ParcelSizeCategory;
  description?: string | null;
  specialInstructions?: string | null;
  prohibitedItemsDeclared: boolean;
  currency: Currency;
  overrideReason?: string | null;
}): Promise<ActionResult & { reference?: string }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }
  if (!input.prohibitedItemsDeclared) {
    return { error: "The prohibited-items declaration is required before booking a parcel." };
  }

  const supabase = await createClient();

  // Price + capacity units from parcel_tariffs, copied onto the booking at
  // booking time (same rule as passenger luggage, §14) - a later tariff
  // change must never alter an already-booked parcel.
  const { data: departure } = await supabase
    .from("departures")
    .select("route_id")
    .eq("id", input.departureId)
    .single();
  if (!departure) return { error: "Departure not found." };

  const { data: tariff } = await supabase
    .from("parcel_tariffs")
    .select("price_gbp, price_eur, capacity_units")
    .eq("route_id", departure.route_id)
    .eq("size_category", input.sizeCategory)
    .eq("active", true)
    .maybeSingle();

  const price = tariff ? (input.currency === "GBP" ? tariff.price_gbp : tariff.price_eur) : 0;
  const unitsConsumed = (tariff?.capacity_units ?? 1) * (input.quantity ?? 1);

  const payload: ParcelBookingInput = {
    sender_name: input.senderName,
    sender_phone: input.senderPhone ?? null,
    sender_address_id: input.senderAddressId ?? null,
    recipient_name: input.recipientName,
    recipient_phone: input.recipientPhone ?? null,
    recipient_address_id: input.recipientAddressId ?? null,
    quantity: input.quantity ?? 1,
    size_category: input.sizeCategory,
    units_consumed: unitsConsumed,
    description: input.description ?? null,
    special_instructions: input.specialInstructions ?? null,
    prohibited_items_declared: input.prohibitedItemsDeclared,
    price,
    currency: input.currency,
    created_by: session.userId,
  };

  const { data, error } = await supabase.rpc("allocate_parcel_capacity", {
    p_departure_id: input.departureId,
    p_parcel: payload,
    p_override_reason: input.overrideReason ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/office/parcels`);
  revalidatePath(`/office/dispatch/${input.departureId}`);
  return { success: true, reference: (data as { reference: string }).reference };
}

export async function listParcelsForDeparture(departureId: string) {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", parcels: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parcels")
    .select("*")
    .eq("departure_id", departureId)
    .order("created_at", { ascending: false });
  if (error) return { error: error.message, parcels: [] };

  return { parcels: data ?? [] };
}

export async function cancelParcel(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("parcels").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/parcels");
  return { success: true };
}

/** Groups a parcel into a stop for collection/delivery — same "Office
 * confirms grouping, never automatic" rule as passengers (§20). */
export async function assignParcelToStop(input: {
  operationalStopId: string;
  parcelId: string;
  role: "collection" | "delivery";
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("operational_stop_parcels").upsert(
    {
      operational_stop_id: input.operationalStopId,
      parcel_id: input.parcelId,
      role: input.role,
    },
    { onConflict: "operational_stop_id,parcel_id,role" }
  );
  if (error) return { error: error.message };

  return { success: true };
}

export async function listParcelTariffsForRoute(routeId: string) {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", tariffs: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parcel_tariffs")
    .select("*")
    .eq("route_id", routeId)
    .eq("active", true);
  if (error) return { error: error.message, tariffs: [] };

  return { tariffs: data ?? [] };
}

export async function upsertParcelTariff(input: {
  id?: string;
  route_id: string;
  size_category: ParcelSizeCategory;
  price_gbp: number;
  price_eur: number;
  capacity_units?: number;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { id, ...rest } = input;
  const { error } = id
    ? await supabase.from("parcel_tariffs").update(rest).eq("id", id)
    : await supabase.from("parcel_tariffs").insert(rest);
  if (error) return { error: error.message };

  revalidatePath("/office/parcels");
  return { success: true };
}
