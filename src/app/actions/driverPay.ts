"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { computeSuggestedPay } from "@/lib/pay/computeSuggestedPay";
import type { Currency, DriverExpenseType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

export async function submitExpense(input: {
  departureId?: string | null;
  type: DriverExpenseType;
  amount: number;
  currency: Currency;
  receiptStoragePath?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return { error: "Only drivers submit expenses." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("driver_expenses").insert({
    driver_id: session.userId,
    departure_id: input.departureId ?? null,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    receipt_storage_path: input.receiptStoragePath ?? null,
  });
  if (error) return { error: error.message };

  return { success: true };
}

export async function approveExpense(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("driver_expenses")
    .update({ approved_by: session.userId, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  return { success: true };
}

export async function listPendingExpenses() {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized.", expenses: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("driver_expenses")
    .select("*, profiles!driver_expenses_driver_id_fkey(display_name)")
    .is("approved_at", null)
    .order("created_at", { ascending: false });
  if (error) return { error: error.message, expenses: [] };

  return { expenses: data ?? [] };
}

/**
 * Build spec §25: hours from paired start/end duty events per calendar
 * day (matches Cleano Ops's own worker-pay-day-bucketing convention —
 * see src/lib/workerPay.ts in cleano-app), trips from the distinct
 * departures the driver had a 'start' event on. Writes a 'draft'
 * statement with the SUGGESTED base_pay; nothing here marks it approved
 * or paid.
 */
export async function generatePayStatement(input: {
  driverId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<ActionResult & { statementId?: string }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: driver } = await supabase
    .from("profiles")
    .select("pay_type, pay_rate")
    .eq("id", input.driverId)
    .single();
  if (!driver) return { error: "Driver not found." };

  const { data: events } = await supabase
    .from("driver_duty_events")
    .select("event_type, event_at, departure_id")
    .eq("driver_id", input.driverId)
    .gte("event_at", `${input.periodStart}T00:00:00`)
    .lte("event_at", `${input.periodEnd}T23:59:59.999`)
    .order("event_at", { ascending: true });

  const byDay = new Map<string, { start?: Date; end?: Date }>();
  const departureIds = new Set<string>();
  for (const e of events ?? []) {
    const day = e.event_at.slice(0, 10);
    const bucket = byDay.get(day) ?? {};
    if (e.event_type === "start") bucket.start = new Date(e.event_at);
    if (e.event_type === "end") bucket.end = new Date(e.event_at);
    byDay.set(day, bucket);
    if (e.departure_id) departureIds.add(e.departure_id);
  }

  let totalHours = 0;
  let daysWorked = 0;
  for (const { start, end } of byDay.values()) {
    if (start && end && end > start) {
      totalHours += (end.getTime() - start.getTime()) / 3_600_000;
      daysWorked += 1;
    } else if (start) {
      daysWorked += 1;
    }
  }

  const { data: expenses } = await supabase
    .from("driver_expenses")
    .select("amount")
    .eq("driver_id", input.driverId)
    .not("approved_at", "is", null)
    .gte("created_at", `${input.periodStart}T00:00:00`)
    .lte("created_at", `${input.periodEnd}T23:59:59.999`);
  const expensesReimbursed = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  const basePay = computeSuggestedPay({
    payType: driver.pay_type,
    payRate: driver.pay_rate,
    totalHours: Math.round(totalHours * 100) / 100,
    totalTrips: departureIds.size,
    totalDaysWorked: daysWorked,
  });

  const { data, error } = await supabase
    .from("driver_pay_statements")
    .insert({
      driver_id: input.driverId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      total_hours: Math.round(totalHours * 100) / 100,
      total_trips: departureIds.size,
      base_pay: basePay,
      expenses_reimbursed: expensesReimbursed,
      total: basePay + expensesReimbursed,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/office/driver-pay");
  return { success: true, statementId: data.id };
}

/** Office approves the final amount (build spec §25) — adjustments lets
 * Office correct the suggested figure without losing what was suggested. */
export async function approvePayStatement(input: {
  id: string;
  adjustments?: number;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: statement } = await supabase
    .from("driver_pay_statements")
    .select("base_pay, expenses_reimbursed")
    .eq("id", input.id)
    .single();
  if (!statement) return { error: "Statement not found." };

  const adjustments = input.adjustments ?? 0;
  const total = statement.base_pay + statement.expenses_reimbursed + adjustments;

  const { error } = await supabase
    .from("driver_pay_statements")
    .update({ adjustments, total, status: "approved", approved_by: session.userId })
    .eq("id", input.id);
  if (error) return { error: error.message };

  revalidatePath("/office/driver-pay");
  return { success: true };
}

export async function listPayStatementsForDriver(driverId: string) {
  const session = await getSession();
  const isSelf = session?.userId === driverId && session.role === "driver";
  if (!session || !(isOffice(session.role) || isSelf)) {
    return { error: "Not authorized.", statements: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("driver_pay_statements")
    .select("*")
    .eq("driver_id", driverId)
    .order("period_start", { ascending: false });
  if (error) return { error: error.message, statements: [] };

  return { statements: data ?? [] };
}
