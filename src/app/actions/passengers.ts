"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { CreatedVia, PassengerCategory } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * List-view search — office-only (RLS backs this up: passengers has no
 * dispatcher/driver policy at all, 0010_passengers.sql). Deliberately
 * excludes vulnerability_notes and mobility_needs from the select list, per
 * build spec §8: "vulnerability_notes restricted to Office/Admin, excluded
 * from exports." Any future list/export query must follow the same
 * convention — this is the guardrail comment for that.
 */
export async function searchPassengers(query: string, limit = 15) {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized.", results: [] };
  }
  if (query.trim().length < 2) return { results: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("passengers")
    .select(
      "id, full_name, phone, email, category, preferred_language, deposit_waiver_standing, no_show_count, late_cancel_count, default_pickup_address_id, default_dropoff_address_id"
    )
    .ilike("full_name", `%${query}%`)
    .limit(limit);
  if (error) return { error: error.message, results: [] };

  return { results: data ?? [] };
}

/**
 * Full row, including vulnerability_notes — office-only. Kept as a
 * separate action from searchPassengers() so the exclusion above is
 * structural, not a field the caller has to remember to drop.
 */
export async function getPassengerDetail(id: string) {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("passengers").select("*").eq("id", id).single();
  if (error) return { error: error.message };

  return { passenger: data };
}

export async function createPassenger(input: {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  preferred_language?: string | null;
  category: PassengerCategory;
  date_of_birth?: string | null;
  age?: number | null;
  is_vulnerable?: boolean;
  mobility_needs?: string | null;
  default_pickup_address_id?: string | null;
  default_dropoff_address_id?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  deposit_waiver_standing?: boolean;
  referrer_org_id?: string | null;
  created_via?: CreatedVia;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("passengers")
    .insert(input)
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/office/passengers");
  return { success: true, id: data.id };
}

export async function updatePassenger(
  id: string,
  input: Partial<{
    full_name: string;
    phone: string | null;
    email: string | null;
    preferred_language: string | null;
    category: PassengerCategory;
    date_of_birth: string | null;
    age: number | null;
    is_vulnerable: boolean;
    mobility_needs: string | null;
    default_pickup_address_id: string | null;
    default_dropoff_address_id: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    deposit_waiver_standing: boolean;
    referrer_org_id: string | null;
  }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("passengers").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/office/passengers/${id}`);
  revalidatePath("/office/passengers");
  return { success: true };
}

/**
 * Separate from updatePassenger() so a Phase 2 access-log hook can wrap
 * just this action later (build spec §8: vulnerability_notes reads/writes
 * should be access-logged — not implemented in Phase 1, but easy to add
 * here without touching the general update path).
 */
export async function updateVulnerabilityNotes(
  id: string,
  notes: string | null,
  isVulnerable: boolean
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("passengers")
    .update({ vulnerability_notes: notes, is_vulnerable: isVulnerable })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/office/passengers/${id}`);
  return { success: true };
}
