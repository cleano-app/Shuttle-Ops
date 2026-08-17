"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { suggestCancellationOutcome } from "@/lib/cancellations/suggestOutcome";
import type { CancellationDepositAction, CancellationFareAction, CancellationRequestedVia } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * Logs a cancellation and computes a SUGGESTED outcome (build spec §11) —
 * never executes it. Increments the passenger's no_show/late_cancel count
 * (§11: "increment no-show/late-cancel count, create a review task after a
 * configurable threshold" — the review-task-on-threshold part is Phase 2
 * hardening scope, not built here, but the count itself is captured now
 * since it's cheap and the whole point is not losing this data).
 */
export async function recordCancellation(input: {
  bookingId: string;
  bookingPassengerId?: string | null;
  noticeHours?: number | null;
  reasonText?: string | null;
  reasonCode?: string | null;
  requestedVia?: CancellationRequestedVia;
  isNoShow?: boolean;
}): Promise<ActionResult & { cancellationId?: string; suggested?: string }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();

  let hasStandingWaiver = false;
  if (input.bookingPassengerId) {
    const { data: bp } = await supabase
      .from("booking_passengers")
      .select("passenger_id, deposit_status")
      .eq("id", input.bookingPassengerId)
      .single();
    if (bp) {
      hasStandingWaiver = bp.deposit_status === "waived";
    }
  }

  const suggestion = suggestCancellationOutcome({
    noticeHours: input.noticeHours ?? null,
    isNoShow: input.isNoShow ?? false,
    hasStandingWaiver,
  });

  const { data, error } = await supabase
    .from("cancellations")
    .insert({
      booking_id: input.bookingId,
      booking_passenger_id: input.bookingPassengerId ?? null,
      notice_hours: input.noticeHours ?? null,
      reason_text: input.reasonText ?? null,
      reason_code: input.reasonCode ?? null,
      requested_via: input.requestedVia ?? "office",
      suggested_outcome: suggestion.code,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (input.bookingPassengerId) {
    const status = input.isNoShow ? "no_show" : "cancelled";
    await supabase.from("booking_passengers").update({ status, no_show: !!input.isNoShow }).eq("id", input.bookingPassengerId);

    const { data: bp } = await supabase
      .from("booking_passengers")
      .select("passenger_id")
      .eq("id", input.bookingPassengerId)
      .single();
    if (bp) {
      const { data: passenger } = await supabase
        .from("passengers")
        .select("no_show_count, late_cancel_count")
        .eq("id", bp.passenger_id)
        .single();
      if (passenger) {
        if (input.isNoShow) {
          await supabase
            .from("passengers")
            .update({ no_show_count: passenger.no_show_count + 1 })
            .eq("id", bp.passenger_id);
        } else {
          await supabase
            .from("passengers")
            .update({ late_cancel_count: passenger.late_cancel_count + 1 })
            .eq("id", bp.passenger_id);
        }
      }
    }
  }

  revalidatePath("/office/cancellations");
  return { success: true, cancellationId: data.id, suggested: suggestion.code };
}

/**
 * Build spec §11: cancellation consequences are ALWAYS discretionary —
 * this is the only action that can set decided_outcome, and it always
 * requires a named decision-maker (decided_by_user_id) and a decision note.
 */
export async function decideCancellation(input: {
  id: string;
  decidedOutcome: string;
  depositAction: CancellationDepositAction;
  retainedAmount?: number | null;
  fareAction: CancellationFareAction;
  chargedAmount?: number | null;
  decisionNote: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }
  if (!input.decisionNote.trim()) {
    return { error: "A decision note is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cancellations")
    .update({
      decided_outcome: input.decidedOutcome,
      deposit_action: input.depositAction,
      retained_amount: input.retainedAmount ?? null,
      fare_action: input.fareAction,
      charged_amount: input.chargedAmount ?? null,
      decision_note: input.decisionNote,
      decided_by_user_id: session.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  revalidatePath("/office/cancellations");
  return { success: true };
}

export async function listUndecidedCancellations() {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized.", cancellations: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cancellations")
    .select("*, bookings(reference)")
    .is("decided_outcome", null)
    .order("cancelled_at", { ascending: false });
  if (error) return { error: error.message, cancellations: [] };

  return { cancellations: data ?? [] };
}
