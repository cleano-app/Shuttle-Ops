"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}

/**
 * Build spec §22: "Driver X drove Vehicle Y from Stop A through Stop B."
 * from/to stop sequence left null covers the whole departure - the common
 * single-driver case.
 */
export async function assignDriver(input: {
  departure_id: string;
  vehicle_id: string;
  driver_id: string;
  role?: "driver" | "co_driver";
  from_stop_sequence?: number | null;
  to_stop_sequence?: number | null;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("driver_assignments")
    .insert({ ...input, assigned_by: session.userId })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${input.departure_id}`);
  return { success: true, id: data.id };
}

export async function removeDriverAssignment(id: string, departureId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("driver_assignments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${departureId}`);
  return { success: true };
}

export async function listDriverAssignmentsForDeparture(departureId: string) {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", assignments: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("driver_assignments")
    .select("*, profiles!driver_assignments_driver_id_fkey(display_name), vehicles(registration)")
    .eq("departure_id", departureId);
  if (error) return { error: error.message, assignments: [] };

  return { assignments: data ?? [] };
}

export async function listDrivers() {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", drivers: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, phone")
    .eq("role", "driver")
    .order("display_name");
  if (error) return { error: error.message, drivers: [] };

  return { drivers: data ?? [] };
}

/**
 * vehicle_duties chains a vehicle's day across departures (build spec
 * §22) - a van running outbound in the morning and return in the evening
 * is one duty across two departures, so mileage/hours carry across both
 * legs instead of being double-counted.
 */
export async function createVehicleDuty(input: {
  vehicle_id: string;
  duty_date: string;
  start_odometer?: number | null;
  notes?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_duties")
    .insert(input)
    .select("id")
    .single();
  if (error) return { error: error.message };

  return { success: true, id: data.id };
}

export async function linkDepartureToVehicleDuty(
  departureId: string,
  vehicleDutyId: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departures")
    .update({ vehicle_duty_id: vehicleDutyId })
    .eq("id", departureId);
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${departureId}`);
  return { success: true };
}
