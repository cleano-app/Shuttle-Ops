"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function login(
  _prevState: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    console.error("signInWithPassword error:", error?.name, error?.message, error?.status);
    // Same distinction as Cleano Ops: Supabase rate-limits repeated sign-in
    // attempts, which otherwise reads as "my password stopped working."
    if (error?.status === 429) {
      return {
        error:
          "Too many sign-in attempts. Please wait a minute before trying again — your password hasn't changed.",
      };
    }
    return { error: "Invalid email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "No profile found for this account. Contact an admin." };
  }

  redirect(profile.role === "driver" ? "/driver" : "/office/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface ForgotPasswordState {
  error?: string;
  success?: boolean;
}

// Uses Supabase Auth's own built-in reset email — no RESEND_API_KEY needed.
// Always reports success regardless of whether the address has an account,
// so this can't be used to enumerate registered emails.
export async function requestPasswordReset(
  _prevState: ForgotPasswordState | undefined,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const headersList = await headers();
  const origin =
    headersList.get("origin") ??
    `${headersList.get("x-forwarded-proto") ?? "https"}://${headersList.get("host")}`;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  return { success: true };
}
