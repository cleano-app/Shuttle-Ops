"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { OrgType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * Referrer/sponsor placeholders only (build spec §4: Referrer is an
 * explicitly later phase). No portal/login exists for these organizations
 * in Phase 1 — Office manages them so passengers.referrer_org_id and
 * booking_passengers.sponsor_org_id have something to point at.
 */
export async function createOrganization(input: {
  name: string;
  org_type: OrgType;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert(input)
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/office/booking-console");
  return { success: true, id: data.id };
}

export async function listOrganizations(orgType?: OrgType) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated.", organizations: [] };

  const supabase = await createClient();
  let query = supabase.from("organizations").select("*").eq("active", true);
  if (orgType) query = query.eq("org_type", orgType);
  const { data, error } = await query.order("name");
  if (error) return { error: error.message, organizations: [] };

  return { organizations: data ?? [] };
}
