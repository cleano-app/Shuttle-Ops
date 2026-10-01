"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth/session";

export interface ActionResult {
  error?: string;
  success?: boolean;
  message?: string;
}

type StaffRole = "admin" | "office" | "dispatcher" | "driver";
const ROLES: StaffRole[] = ["admin", "office", "dispatcher", "driver"];

/** Spec §4: Admin manages users; Office manages drivers. */
function canCreate(sessionRole: string, role: StaffRole) {
  if (sessionRole === "admin") return true;
  return sessionRole === "office" && role === "driver";
}

async function siteOrigin() {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/**
 * Adds a staff member. No password is chosen for them: the account gets a
 * random one and Supabase's own reset email lets them set their own —
 * same approach as linking a referrer organisation's contact.
 */
export async function createStaffMember(input: {
  email: string;
  displayName: string;
  role: StaffRole;
  phone?: string | null;
  payType?: "hourly" | "per_trip" | "per_day" | null;
  payRate?: number | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: "Not authorized." };
  if (!ROLES.includes(input.role)) return { error: "Choose a role." };
  if (!canCreate(session.role, input.role)) {
    return { error: "Only an admin can add office, dispatch or admin users." };
  }
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email || !displayName) return { error: "Name and email are required." };

  const admin = createAdminClient();
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return { error: listError.message };
  const existing = list.users.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    const { data: profile } = await admin.from("profiles").select("id").eq("id", existing.id).maybeSingle();
    if (profile) return { error: "That email already belongs to a staff member." };
  }

  let userId = existing?.id;
  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: true,
    });
    if (createError || !created.user) return { error: createError?.message ?? "Could not create the account." };
    userId = created.user.id;
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    role: input.role,
    display_name: displayName,
    phone: input.phone?.trim() || null,
    pay_type: input.role === "driver" ? input.payType ?? null : null,
    pay_rate: input.role === "driver" ? input.payRate ?? null : null,
  });
  if (profileError) return { error: profileError.message };

  const supabase = await createClient();
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/reset-password`,
  });

  revalidatePath("/office/team");
  return {
    success: true,
    message: resetError
      ? `${displayName} added, but the set-password email failed (${resetError.message}). They can use "Forgot password" on the sign-in page.`
      : `${displayName} added. They've been emailed a link to set their password.`,
  };
}

export async function updateStaffMember(
  id: string,
  input: {
    displayName: string;
    phone?: string | null;
    role?: StaffRole;
    payType?: "hourly" | "per_trip" | "per_day" | null;
    payRate?: number | null;
  }
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "office")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: current } = await admin.from("profiles").select("role").eq("id", id).single();
  if (!current) return { error: "Staff member not found." };
  if (session.role !== "admin" && (current.role !== "driver" || (input.role && input.role !== "driver"))) {
    return { error: "Only an admin can change office, dispatch or admin users." };
  }
  if (id === session.userId && input.role && input.role !== current.role) {
    return { error: "You can't change your own role." };
  }

  const role = input.role ?? (current.role as StaffRole);
  const { error } = await admin
    .from("profiles")
    .update({
      display_name: input.displayName.trim(),
      phone: input.phone?.trim() || null,
      role,
      pay_type: role === "driver" ? input.payType ?? null : null,
      pay_rate: role === "driver" ? input.payRate ?? null : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/team");
  return { success: true, message: "Saved." };
}

export async function sendPasswordLink(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "office")) return { error: "Not authorized." };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user?.email) return { error: error?.message ?? "No email on this account." };
  const supabase = await createClient();
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.user.email, {
    redirectTo: `${await siteOrigin()}/reset-password`,
  });
  if (resetError) return { error: resetError.message };
  return { success: true, message: `Password link sent to ${data.user.email}.` };
}

export async function listStaff() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "office")) {
    return { error: "Not authorized.", staff: [] };
  }
  const admin = createAdminClient();
  const [{ data: profiles, error }, { data: users }] = await Promise.all([
    admin.from("profiles").select("id, role, display_name, phone, pay_type, pay_rate").order("display_name"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (error) return { error: error.message, staff: [] };
  const emails = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  return {
    staff: (profiles ?? []).map((p) => ({ ...p, email: emails.get(p.id) ?? "" })),
  };
}
