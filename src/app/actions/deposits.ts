"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { Currency } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * Records a deposit taken manually by Office (cash/bank transfer — build
 * spec §39 Phase 1 scope excludes live Take Payments, that's Phase 4).
 * Standing waivers (passengers.deposit_waiver_standing) are applied
 * earlier, when the booking_passengers row is first built for the capacity
 * RPC — this action is only for a deposit that is actually being taken.
 */
export async function recordDeposit(input: {
  bookingPassengerId: string;
  amount: number;
  currency: Currency;
  method: string;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error: depositError } = await supabase.from("deposits").insert({
    booking_passenger_id: input.bookingPassengerId,
    amount: input.amount,
    currency: input.currency,
    status: "secured",
    method: input.method,
    taken_by_user_id: session.userId,
    taken_at: new Date().toISOString(),
    notes: input.notes ?? null,
  });
  if (depositError) return { error: depositError.message };

  const { error: bpError } = await supabase
    .from("booking_passengers")
    .update({ deposit_status: "secured" })
    .eq("id", input.bookingPassengerId);
  if (bpError) return { error: bpError.message };

  revalidatePath("/office/booking-console");
  return { success: true };
}

export async function releaseDeposit(depositId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: deposit, error } = await supabase
    .from("deposits")
    .update({ status: "released", released_at: new Date().toISOString() })
    .eq("id", depositId)
    .select("booking_passenger_id")
    .single();
  if (error) return { error: error.message };

  await supabase
    .from("booking_passengers")
    .update({ deposit_status: "released" })
    .eq("id", deposit.booking_passenger_id);

  revalidatePath("/office/booking-console");
  return { success: true };
}

/**
 * Build spec §10: "Retention requires an Office decision, a reason and a
 * named decision-maker." — all three are required parameters here, not
 * optional, so this action structurally can't be called without them.
 */
export async function retainDeposit(input: {
  depositId: string;
  retainedAmount: number;
  reasonCode: string;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: deposit, error } = await supabase
    .from("deposits")
    .update({
      status: "retained",
      retained_at: new Date().toISOString(),
      retained_amount: input.retainedAmount,
      reason_code: input.reasonCode,
      decided_by_user_id: session.userId,
      notes: input.notes ?? null,
    })
    .eq("id", input.depositId)
    .select("booking_passenger_id")
    .single();
  if (error) return { error: error.message };

  await supabase
    .from("booking_passengers")
    .update({ deposit_status: "retained" })
    .eq("id", deposit.booking_passenger_id);

  revalidatePath("/office/booking-console");
  return { success: true };
}

export async function waiveDeposit(input: {
  bookingPassengerId: string;
  reasonCode: string;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error: waiverError } = await supabase.from("waivers").insert({
    booking_passenger_id: input.bookingPassengerId,
    reason_code: input.reasonCode,
    notes: input.notes ?? null,
    granted_by_user_id: session.userId,
  });
  if (waiverError) return { error: waiverError.message };

  const { error: bpError } = await supabase
    .from("booking_passengers")
    .update({ deposit_status: "waived" })
    .eq("id", input.bookingPassengerId);
  if (bpError) return { error: bpError.message };

  revalidatePath("/office/booking-console");
  return { success: true };
}
