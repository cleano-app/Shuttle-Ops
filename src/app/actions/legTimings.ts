"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

/** Build spec §19's nightly job, run on demand from a button on the fleet/
 * reports screen — no real cron infrastructure exists (see
 * 0047_leg_timings_recompute.sql's comment). */
export async function recomputeLegTimings(): Promise<ActionResult & { updated?: number }> {
  const session = await getSession();
  if (!session || !(session.role === "admin" || session.role === "office")) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recompute_leg_timings");
  if (error) return { error: error.message };

  return { success: true, updated: data ?? 0 };
}
