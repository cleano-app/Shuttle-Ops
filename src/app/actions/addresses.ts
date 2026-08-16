"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { AddressType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}

/**
 * Thin RPC wrapper around search_addresses() (0004_addresses.sql) — the
 * internal fuzzy-match autocomplete (build spec §16). No external
 * mapping/address-validation API is used anywhere in this app.
 */
export async function searchAddressesAction(query: string, limit = 10) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated.", results: [] };
  if (query.trim().length < 2) return { results: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_addresses", {
    p_query: query,
    p_limit: limit,
  });
  if (error) return { error: error.message, results: [] };

  return { results: data ?? [] };
}

export async function createAddress(input: {
  line1: string;
  line2?: string | null;
  city?: string | null;
  postcode: string;
  country?: string;
  area_id?: string | null;
  access_notes?: string | null;
  address_type?: AddressType | null;
  fixed_point_name?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("addresses")
    .insert({ ...input, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/office/booking-console");
  return { success: true, id: data.id };
}

export async function updateAddress(
  id: string,
  input: Partial<{
    line1: string;
    line2: string | null;
    city: string | null;
    postcode: string;
    country: string;
    area_id: string | null;
    access_notes: string | null;
    address_type: AddressType | null;
    fixed_point_name: string | null;
    active: boolean;
  }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("addresses").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/booking-console");
  return { success: true };
}
