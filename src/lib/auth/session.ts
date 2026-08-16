import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/types/database";

export interface Session {
  userId: string;
  email: string | null;
  role: StaffRole;
  displayName: string;
  phone: string | null;
}

/**
 * Cached per request (React `cache`) so multiple server components in the
 * same render pass share one auth + profile lookup. Same convention as
 * Cleano Ops's getSession(), simplified for Phase 1: no passenger portal
 * yet (§39 scope), so every logged-in user has exactly one `profiles` row
 * and one role - no active-context switching needed here.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile.role,
    displayName: profile.display_name,
    phone: profile.phone,
  };
});
