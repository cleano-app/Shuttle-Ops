"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

/**
 * Build spec §34: Admin sets a fixed internal rate periodically, used
 * ONLY to consolidate reporting into one currency — never affects what a
 * passenger is charged. Closes off any currently-open rate (effective_to
 * null) before opening the new one, so there's always exactly one rate in
 * force at a time and reports can always find "the rate that applied on
 * date X."
 */
export async function setAccountingRate(input: {
  gbpPerEur: number;
  effectiveFrom: string;
  note?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { error: "Only Admin can set the accounting rate." };
  }

  const supabase = await createClient();

  await supabase
    .from("accounting_rates")
    .update({ effective_to: input.effectiveFrom })
    .is("effective_to", null);

  const { error } = await supabase.from("accounting_rates").insert({
    effective_from: input.effectiveFrom,
    gbp_per_eur: input.gbpPerEur,
    set_by_user_id: session.userId,
    note: input.note ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/office/accounting");
  return { success: true };
}

export async function getCurrentAccountingRate() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_rates")
    .select("*")
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };

  return { rate: data };
}

export async function listAccountingRates() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated.", rates: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_rates")
    .select("*")
    .order("effective_from", { ascending: false });
  if (error) return { error: error.message, rates: [] };

  return { rates: data ?? [] };
}
