"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { DefectSeverity, VehicleCheckType, VehicleCheckResult, VehicleDocType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}
function isOffice(role: string) {
  return role === "admin" || role === "office";
}

// ---------------------------------------------------------------------
// Documents (build spec §28)
// ---------------------------------------------------------------------

export async function addVehicleDocument(input: {
  vehicle_id: string;
  doc_type: VehicleDocType;
  reference?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
  storage_path?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_documents")
    .insert({ ...input, uploaded_by: session.userId });
  if (error) return { error: error.message };

  revalidatePath(`/office/vehicles/${input.vehicle_id}`);
  return { success: true };
}

export async function listVehicleDocuments(vehicleId: string) {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", documents: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_documents")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("expires_at", { ascending: true, nullsFirst: false });
  if (error) return { error: error.message, documents: [] };

  return { documents: data ?? [] };
}

/**
 * Build spec §28: "Automatic reminders create fleet tasks. Default 30/14/7
 * days before expiry." No cron infrastructure exists yet (leg_timings'
 * nightly job is explicitly Phase 4, §39) — this is a lazy sweep instead,
 * same pattern as Phase 1's stale-provisional-booking expiry: called from
 * the fleet dashboard page load, not a background job. One open task per
 * document (not one per 30/14/7 threshold) — the task is created once the
 * document enters the 30-day window and stays open until resolved
 * (document renewed); urgency within that window is a display concern,
 * not three separate tasks.
 */
export async function checkDocumentExpiryReminders(): Promise<ActionResult & { created?: number }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const reminderWindowDate = new Date();
  reminderWindowDate.setDate(reminderWindowDate.getDate() + 30);

  const { data: dueDocuments, error } = await supabase
    .from("vehicle_documents")
    .select("id, vehicle_id, doc_type, expires_at")
    .not("expires_at", "is", null)
    .lte("expires_at", reminderWindowDate.toISOString().slice(0, 10));
  if (error) return { error: error.message };
  if (!dueDocuments || dueDocuments.length === 0) return { success: true, created: 0 };

  let created = 0;
  for (const doc of dueDocuments) {
    const { count } = await supabase
      .from("fleet_tasks")
      .select("id", { count: "exact", head: true })
      .eq("source_document_id", doc.id)
      .eq("status", "open");
    if (count && count > 0) continue;

    const { error: insertError } = await supabase.from("fleet_tasks").insert({
      vehicle_id: doc.vehicle_id,
      task_type: "document_expiry",
      title: `${doc.doc_type.toUpperCase()} expiring`,
      description: `Expires ${doc.expires_at}.`,
      due_date: doc.expires_at,
      created_from: "document_expiry_sweep",
      source_document_id: doc.id,
    });
    if (!insertError) created += 1;
  }

  return { success: true, created };
}

// ---------------------------------------------------------------------
// Daily walkaround checks (build spec §29)
// ---------------------------------------------------------------------

export interface VehicleCheckItem {
  key: string;
  label: string;
  status: "ok" | "advisory" | "critical";
  note?: string;
}

export async function submitVehicleCheck(input: {
  vehicle_id: string;
  departure_id?: string | null;
  check_type: VehicleCheckType;
  items: VehicleCheckItem[];
  signature?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== "driver") {
    return { error: "Only drivers submit vehicle checks." };
  }

  const result: VehicleCheckResult = input.items.some((i) => i.status === "critical")
    ? "critical_defect"
    : input.items.some((i) => i.status === "advisory")
      ? "advisory_defect"
      : "pass";

  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_checks").insert({
    vehicle_id: input.vehicle_id,
    driver_id: session.userId,
    departure_id: input.departure_id ?? null,
    check_type: input.check_type,
    items: input.items,
    result,
    signature: input.signature ?? null,
    notes: input.notes ?? null,
  });
  if (error) return { error: error.message };

  return { success: true };
}

// ---------------------------------------------------------------------
// Defects (build spec §30)
// ---------------------------------------------------------------------

export async function reportDefect(input: {
  vehicle_id: string;
  severity: DefectSeverity;
  description: string;
  photo_path?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !(isDispatcherOrAbove(session.role) || session.role === "driver")) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_defects").insert({
    ...input,
    reported_by: session.userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/office/vehicles/${input.vehicle_id}`);
  return { success: true };
}

export async function resolveDefect(
  id: string,
  resolutionNote: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_defects")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolution_note: resolutionNote })
    .eq("id", id);
  if (error) return { error: error.message };

  return { success: true };
}

export async function listVehicleDefects(vehicleId: string) {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", defects: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_defects")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("reported_at", { ascending: false });
  if (error) return { error: error.message, defects: [] };

  return { defects: data ?? [] };
}

// ---------------------------------------------------------------------
// Maintenance (build spec §30) — Office/Admin only
// ---------------------------------------------------------------------

export async function scheduleMaintenance(input: {
  vehicle_id: string;
  type: string;
  scheduled_at?: string | null;
  mileage?: number | null;
  supplier?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_maintenance").insert(input);
  if (error) return { error: error.message };

  revalidatePath(`/office/vehicles/${input.vehicle_id}`);
  return { success: true };
}

export async function completeMaintenance(input: {
  id: string;
  vehicle_id: string;
  completed_at: string;
  cost?: number | null;
  currency?: "GBP" | "EUR" | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_maintenance")
    .update({
      completed_at: input.completed_at,
      cost: input.cost ?? null,
      currency: input.currency ?? null,
      notes: input.notes ?? null,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  return { success: true };
}

// ---------------------------------------------------------------------
// Fleet tasks
// ---------------------------------------------------------------------

export async function listOpenFleetTasks() {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", tasks: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fleet_tasks")
    .select("*, vehicles(registration)")
    .in("status", ["open", "in_progress"])
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) return { error: error.message, tasks: [] };

  return { tasks: data ?? [] };
}

export async function resolveFleetTask(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("fleet_tasks")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: session.userId })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/fleet");
  return { success: true };
}
