"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/auth/portalSession";
import type { Currency, MyParcelSummary, ParcelBookingInput, ParcelSizeCategory } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

/**
 * Build spec Phase 5 (§39): "parcel booking" through the portal. Same
 * copy-on-booking tariff lookup as the office path (src/app/actions/
 * parcels.ts's createParcelBooking) — duplicated rather than shared
 * because the office version is staff-authorized and takes a sender
 * identity as free-text input; here the sender is always the logged-in
 * passenger's own profile.
 */
export async function createOnlineParcelBooking(input: {
  departureId: string;
  recipientName: string;
  recipientPhone?: string | null;
  recipientAddressId?: string | null;
  quantity?: number;
  sizeCategory: ParcelSizeCategory;
  description?: string | null;
  specialInstructions?: string | null;
  prohibitedItemsDeclared: boolean;
  currency: Currency;
}): Promise<ActionResult & { reference?: string }> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger" || !session.passengerId) {
    return { error: "Not authorized." };
  }
  if (!input.prohibitedItemsDeclared) {
    return { error: "The prohibited-items declaration is required before booking a parcel." };
  }

  const supabase = await createClient();

  const { data: myProfile } = await supabase.rpc("get_my_passenger_profile");
  const sender = (myProfile as { full_name: string; phone: string | null }[] | null)?.[0];
  if (!sender) return { error: "Could not load your profile." };

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

  const payload: ParcelBookingInput & { booked_online_by_passenger_id: string } = {
    sender_name: sender.full_name,
    sender_phone: sender.phone,
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
    booked_online_by_passenger_id: session.passengerId,
  };

  const { data, error } = await supabase.rpc("allocate_parcel_capacity", {
    p_departure_id: input.departureId,
    p_parcel: payload,
    p_override_reason: null,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/parcels");
  return { success: true, reference: (data as { reference: string }).reference };
}

export async function listMyParcels(): Promise<{ error?: string; parcels: MyParcelSummary[] }> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger") {
    return { error: "Not authorized.", parcels: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_parcels");
  if (error) return { error: error.message, parcels: [] };

  return { parcels: (data ?? []) as MyParcelSummary[] };
}
