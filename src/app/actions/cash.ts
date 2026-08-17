"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { CashTransactionType, Currency } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * Build spec §26 — a driver recording cash they've collected/handed over.
 * Direct RLS insert (driver_id = auth.uid()), same as duty events; the
 * office-side reconciliation step is a separate action below.
 */
export async function recordCashTransaction(input: {
  departureId?: string | null;
  bookingId?: string | null;
  parcelId?: string | null;
  transactionType: CashTransactionType;
  currency: Currency;
  amount: number;
  receivedFrom?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return { error: "Only drivers record cash transactions." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cash_transactions").insert({
    driver_id: session.userId,
    departure_id: input.departureId ?? null,
    booking_id: input.bookingId ?? null,
    parcel_id: input.parcelId ?? null,
    transaction_type: input.transactionType,
    currency: input.currency,
    amount: input.amount,
    received_from: input.receivedFrom ?? null,
    notes: input.notes ?? null,
  });
  if (error) return { error: error.message };

  return { success: true };
}

export async function listCashForDeparture(departureId: string) {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized.", transactions: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_transactions")
    .select("*, profiles!cash_transactions_driver_id_fkey(display_name)")
    .eq("departure_id", departureId)
    .order("received_at", { ascending: true });
  if (error) return { error: error.message, transactions: [] };

  return { transactions: data ?? [] };
}

/**
 * Build spec §26: Office "records actual cash and any discrepancy."
 * Marking reconciled_at/reconciled_by is what clears
 * departure_has_unreconciled_cash() (0043) — the one thing standing
 * between a departure and `completed`.
 */
export async function reconcileCashTransaction(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_transactions")
    .update({ reconciled_by: session.userId, reconciled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  return { success: true };
}

export async function reconcileAllForDeparture(departureId: string): Promise<ActionResult & { reconciled?: number }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_transactions")
    .update({ reconciled_by: session.userId, reconciled_at: new Date().toISOString() })
    .eq("departure_id", departureId)
    .is("reconciled_at", null)
    .select("id");
  if (error) return { error: error.message };

  revalidatePath(`/office/departures/${departureId}`);
  return { success: true, reconciled: data?.length ?? 0 };
}
