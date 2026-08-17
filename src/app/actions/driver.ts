"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { DriverAssignmentSummary, DriverStopManifest, DutyEventType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function requireDriver(role: string) {
  return role === "driver";
}

/** All of these are thin wrappers around the security-definer functions in
 * 0027_driver_functions.sql - the role check here is a fast-fail UX
 * nicety, the RPC's own is_driver() + driver_covers_stop() checks are what
 * actually enforce the boundary regardless of what this wrapper does. */

export async function getMyAssignments(): Promise<{
  error?: string;
  assignments: DriverAssignmentSummary[];
}> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized.", assignments: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_driver_assignments");
  if (error) return { error: error.message, assignments: [] };

  return { assignments: (data ?? []) as DriverAssignmentSummary[] };
}

export async function getMyStopManifest(
  departureId: string
): Promise<{ error?: string; manifest?: DriverStopManifest }> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_driver_stop_manifest", {
    p_departure_id: departureId,
  });
  if (error) return { error: error.message };

  return { manifest: data as DriverStopManifest };
}

export async function respondToAssignment(assignmentId: string, accept: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_driver_assignment", {
    p_assignment_id: assignmentId,
    p_accept: accept,
  });
  if (error) return { error: error.message };

  return { success: true };
}

/** The "Arrived" button. clientId is the offline queue's client-generated
 * UUID - replaying it after reconnect is a harmless no-op server-side. */
export async function arriveAtStop(input: {
  stopId: string;
  clientId: string;
  odometer?: number | null;
  note?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_stop_arrival", {
    p_stop_id: input.stopId,
    p_client_id: input.clientId,
    p_odometer: input.odometer ?? null,
    p_note: input.note ?? null,
  });
  if (error) return { error: error.message };

  return { success: true };
}

/** The "Collected" / move-on action. */
export async function departStop(stopId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_stop_departure", { p_stop_id: stopId });
  if (error) return { error: error.message };

  return { success: true };
}

/** The "Problem" button. */
export async function reportStopProblem(stopId: string, note: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_stop_problem", { p_stop_id: stopId, p_note: note });
  if (error) return { error: error.message };

  return { success: true };
}

export async function markPassengerBoarded(
  operationalStopPassengerId: string,
  boarded = true,
  noShow = false
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_passenger_boarded", {
    p_operational_stop_passenger_id: operationalStopPassengerId,
    p_boarded: boarded,
    p_no_show: noShow,
  });
  if (error) return { error: error.message };

  return { success: true };
}

/**
 * General duty-level events (start/break/fuel/border/end/handover) — not
 * tied to a specific stop, so unlike the stop actions above these go
 * straight to the table via RLS (driver_duty_events_driver_insert,
 * 0026_driver_duty_events.sql) rather than a security-definer function;
 * there's no cross-table logic here, just "insert my own row."
 * upsert+ignoreDuplicates on client_id gives the same offline-replay
 * safety as the RPC functions.
 */
export async function logDutyEvent(input: {
  clientId: string;
  eventType: DutyEventType;
  departureId?: string | null;
  vehicleId?: string | null;
  odometer?: number | null;
  note?: string | null;
  clientOccurredAt?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("driver_duty_events").upsert(
    {
      driver_id: session.userId,
      vehicle_id: input.vehicleId ?? null,
      departure_id: input.departureId ?? null,
      event_type: input.eventType,
      client_id: input.clientId,
      client_occurred_at: input.clientOccurredAt ?? null,
      odometer: input.odometer ?? null,
      note: input.note ?? null,
    },
    { onConflict: "client_id", ignoreDuplicates: true }
  );
  if (error) return { error: error.message };

  revalidatePath("/driver");
  return { success: true };
}

export async function createHandoverAction(input: {
  departureId: string;
  vehicleId: string;
  toDriverId: string;
  stopId?: string | null;
  odometer?: number | null;
  fuelLevel?: string | null;
  cashFloatGbp?: number | null;
  cashFloatEur?: number | null;
  passengerCountConfirmed?: number | null;
  parcelCountConfirmed?: number | null;
  keysTransferred?: boolean;
  notes?: string | null;
  signature?: string | null;
}): Promise<ActionResult & { handoverId?: string }> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_handover", {
    p_departure_id: input.departureId,
    p_vehicle_id: input.vehicleId,
    p_to_driver_id: input.toDriverId,
    p_stop_id: input.stopId ?? null,
    p_odometer: input.odometer ?? null,
    p_fuel_level: input.fuelLevel ?? null,
    p_cash_float_gbp: input.cashFloatGbp ?? null,
    p_cash_float_eur: input.cashFloatEur ?? null,
    p_passenger_count_confirmed: input.passengerCountConfirmed ?? null,
    p_parcel_count_confirmed: input.parcelCountConfirmed ?? null,
    p_keys_transferred: input.keysTransferred ?? false,
    p_notes: input.notes ?? null,
    p_signature: input.signature ?? null,
  });
  if (error) return { error: error.message };

  return { success: true, handoverId: (data as { handover_id: string }).handover_id };
}

export async function confirmHandoverAction(handoverId: string, signature: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_handover", {
    p_handover_id: handoverId,
    p_signature: signature,
  });
  if (error) return { error: error.message };

  return { success: true };
}

// --- Parcels (build spec §15/§31, Phase 3) — same driver_covers_stop()-
// scoped security-definer functions as the passenger stop actions. ---

export async function collectParcel(operationalStopParcelId: string, clientId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_parcel_collected", {
    p_operational_stop_parcel_id: operationalStopParcelId,
    p_client_id: clientId,
  });
  if (error) return { error: error.message };

  return { success: true };
}

export async function deliverParcel(input: {
  operationalStopParcelId: string;
  signatureName?: string | null;
  proofPhotoPath?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_parcel_delivered", {
    p_operational_stop_parcel_id: input.operationalStopParcelId,
    p_signature_name: input.signatureName ?? null,
    p_proof_photo_path: input.proofPhotoPath ?? null,
  });
  if (error) return { error: error.message };

  return { success: true };
}

export async function reportParcelFailed(operationalStopParcelId: string, reason: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !requireDriver(session.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_parcel_failed", {
    p_operational_stop_parcel_id: operationalStopParcelId,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  return { success: true };
}
