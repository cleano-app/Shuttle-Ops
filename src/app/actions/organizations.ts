"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * Referrer/sponsor placeholders in Phase 1-4 (build spec §4: Referrer was
 * an explicitly later phase — now built out in Phase 5, §39). Office
 * manages these so passengers.referrer_org_id and
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

/**
 * Build spec Phase 5 (§39): Office links a specific person to a
 * referrer/sponsor org's portal login. Deliberately no invite email sent
 * (this app has no confirmed email delivery outside Supabase Auth's own —
 * see the SMS/Take Payments stubs elsewhere for the same "not configured
 * yet" limitation) and no password chosen here — the auth user is created
 * with a random, never-shown password, and the contact sets their own via
 * the portal's existing "forgot password" flow once Office tells them
 * their login email is ready. Same admin-client createUser shape as
 * scripts/seed-users.ts.
 */
export async function linkOrganizationUser(input: {
  organizationId: string;
  email: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }
  const email = input.email.trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const admin = createAdminClient();

  const { data: existingList, error: listError } = await admin.auth.admin.listUsers();
  if (listError) return { error: listError.message };
  let userId = existingList.users.find((u) => u.email?.toLowerCase() === email)?.id;

  if (!userId) {
    const randomPassword = crypto.randomUUID() + crypto.randomUUID();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
    });
    if (createError || !created.user) return { error: createError?.message ?? "Could not create the account." };
    userId = created.user.id;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organization_account_users").insert({
    organization_id: input.organizationId,
    user_id: userId,
  });
  if (error) return { error: error.message };

  revalidatePath("/office/organizations");
  return { success: true };
}

export async function listOrganizationUsers(organizationId: string) {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized.", users: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_account_users")
    .select("id, user_id, created_at")
    .eq("organization_id", organizationId);
  if (error) return { error: error.message, users: [] };

  return { users: data ?? [] };
}
