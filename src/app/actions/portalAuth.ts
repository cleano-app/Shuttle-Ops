"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface PortalAuthState {
  error?: string;
  success?: boolean;
}

/**
 * Build spec Phase 5 (§39): passenger self-service signup. Always creates
 * a brand new passengers row via signup_passenger_account() (0050) —
 * never tries to match/claim an existing phone-booked record, since a
 * name/phone match could let a stranger read someone else's booking
 * history just by guessing it right.
 */
export async function portalSignup(
  _prevState: PortalAuthState | undefined,
  formData: FormData
): Promise<PortalAuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const preferredLanguage = String(formData.get("preferred_language") ?? "") || null;

  if (!email || !password || !fullName) {
    return { error: "Name, email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return { error: error?.message ?? "Could not create your account." };
  }

  // Email confirmation may be required before a session exists — if so,
  // signup_passenger_account() would fail (auth.uid() resolves from the
  // session, and there isn't one yet). Tell the user to confirm first;
  // they land back here to finish once confirmed.
  if (!data.session) {
    return { success: true };
  }

  const { error: rpcError } = await supabase.rpc("signup_passenger_account", {
    p_full_name: fullName,
    p_phone: phone,
    p_email: email,
    p_preferred_language: preferredLanguage,
  });
  if (rpcError) {
    // Don't leave an authenticated Supabase session with no
    // passenger_account_users link — getPortalSession() would return
    // null for it forever, and every /portal/* page would bounce them
    // between /portal/login and / (proxy.ts redirects an authenticated
    // user off portal auth pages, but neither / nor any protected layout
    // can resolve a session with no link at all). Same "sign out rather
    // than leave an orphan session" rule portalLogin() already follows
    // for the no-link-found case.
    await supabase.auth.signOut();
    return { error: rpcError.message };
  }

  redirect("/portal/dashboard");
}

export async function portalLogin(
  _prevState: PortalAuthState | undefined,
  formData: FormData
): Promise<PortalAuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.status === 429) {
      return { error: "Too many sign-in attempts. Please wait a minute before trying again." };
    }
    return { error: "Invalid email or password." };
  }

  const { data: pau } = await supabase
    .from("passenger_account_users")
    .select("passenger_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (pau) redirect("/portal/dashboard");

  const { data: oau } = await supabase
    .from("organization_account_users")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (oau) redirect("/portal/referrer/dashboard");

  await supabase.auth.signOut();
  return { error: "No portal account found for this login. If you're a passenger, sign up below." };
}

export async function portalLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/portal/login");
}

export async function requestPortalPasswordReset(
  _prevState: PortalAuthState | undefined,
  formData: FormData
): Promise<PortalAuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const headersList = await headers();
  const origin =
    headersList.get("origin") ??
    `${headersList.get("x-forwarded-proto") ?? "https"}://${headersList.get("host")}`;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/portal/reset-password`,
  });

  return { success: true };
}
