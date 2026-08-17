"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/auth/portalSession";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function searchAddressesForPortal(query: string) {
  const session = await getPortalSession();
  if (!session) return { error: "Not authorized.", addresses: [] };
  if (!query.trim()) return { addresses: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_addresses", { p_query: query, p_limit: 8 });
  if (error) return { error: error.message, addresses: [] };

  return { addresses: data ?? [] };
}

/**
 * Build spec Phase 5 (§39): "saved addresses." A passenger's own private
 * shortlist (passenger_saved_addresses, 0050) pointing at rows in the
 * shared `addresses` table — either an existing one (picked via
 * searchAddressesForPortal) or a brand new one created through the narrow
 * create_passenger_address() RPC.
 */
export async function saveMyAddress(input: {
  existingAddressId?: string | null;
  newAddress?: {
    line1: string;
    line2?: string | null;
    city?: string | null;
    postcode: string;
    country?: string;
    areaId?: string | null;
  } | null;
  label?: string | null;
  isDefaultPickup?: boolean;
  isDefaultDropoff?: boolean;
}): Promise<ActionResult> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger" || !session.passengerId) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  let addressId = input.existingAddressId ?? null;

  if (!addressId && input.newAddress) {
    if (!input.newAddress.line1.trim() || !input.newAddress.postcode.trim()) {
      return { error: "Address line 1 and postcode are required." };
    }
    const { data, error } = await supabase.rpc("create_passenger_address", {
      p_line1: input.newAddress.line1,
      p_line2: input.newAddress.line2 ?? null,
      p_city: input.newAddress.city ?? null,
      p_postcode: input.newAddress.postcode,
      p_country: input.newAddress.country ?? "GB",
      p_area_id: input.newAddress.areaId ?? null,
    });
    if (error) return { error: error.message };
    addressId = data as string;
  }

  if (!addressId) return { error: "Choose an existing address or enter a new one." };

  const { error } = await supabase.from("passenger_saved_addresses").insert({
    passenger_id: session.passengerId,
    address_id: addressId,
    label: input.label ?? null,
    is_default_pickup: input.isDefaultPickup ?? false,
    is_default_dropoff: input.isDefaultDropoff ?? false,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/addresses");
  return { success: true };
}

export async function listMySavedAddresses() {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger") {
    return { error: "Not authorized.", addresses: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("passenger_saved_addresses")
    .select("*, addresses(*)")
    .eq("passenger_id", session.passengerId ?? "")
    .order("created_at", { ascending: false });
  if (error) return { error: error.message, addresses: [] };

  return { addresses: data ?? [] };
}

export async function deleteMySavedAddress(id: string): Promise<ActionResult> {
  const session = await getPortalSession();
  if (!session || session.kind !== "passenger") {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("passenger_saved_addresses").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/addresses");
  return { success: true };
}
