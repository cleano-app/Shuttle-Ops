"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { CallOutcome } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * Build spec §38: "no_capacity and abandoned_at_menu are the two most
 * valuable metrics in the system." The automated line itself needs a real
 * Twilio/Aircall number this project doesn't have (§33 is a documented
 * gap) — this logs the same outcomes for ordinary phone calls Office
 * handles today, so the metric exists from day one rather than only once
 * a phone system is wired up.
 */
export async function logCall(input: {
  fromNumber?: string | null;
  matchedPassengerId?: string | null;
  duration?: number | null;
  outcome: CallOutcome;
  notes?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("call_logs")
    .insert({
      from_number: input.fromNumber ?? null,
      matched_passenger_id: input.matchedPassengerId ?? null,
      operator_id: session.userId,
      duration: input.duration ?? null,
      channel: "phone",
      outcome: input.outcome,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  return { success: true, id: data.id };
}

/**
 * One call is one log row: the console creates it on the first outcome and
 * keeps it up to date as the outcome changes or notes are typed
 * (auto-save), instead of the operator pressing Log for each change.
 */
export async function updateCallLog(
  id: string,
  input: {
    outcome?: CallOutcome;
    notes?: string | null;
    matchedPassengerId?: string | null;
    fromNumber?: string | null;
  }
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }
  const patch: { outcome?: CallOutcome; notes?: string | null; matched_passenger_id?: string | null; from_number?: string | null } = {};
  if (input.outcome) patch.outcome = input.outcome;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.matchedPassengerId !== undefined) patch.matched_passenger_id = input.matchedPassengerId;
  if (input.fromNumber !== undefined) patch.from_number = input.fromNumber;

  const supabase = await createClient();
  const { error } = await supabase.from("call_logs").update(patch).eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function getCallLogSummary(sinceDays = 30) {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized.", byOutcome: {} };
  }

  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("call_logs")
    .select("outcome")
    .gte("started_at", since.toISOString());
  if (error) return { error: error.message, byOutcome: {} };

  const byOutcome: Record<string, number> = {};
  for (const row of data ?? []) {
    byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + 1;
  }
  return { byOutcome };
}
