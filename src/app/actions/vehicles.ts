"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { VehicleStatus } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}

export async function createVehicle(input: {
  registration: string;
  make_model?: string | null;
  seat_capacity: number;
  hold_capacity_units?: number;
  wheelchair_capacity?: number;
  current_mileage?: number | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").insert(input);
  if (error) return { error: error.message };

  revalidatePath("/office/vehicles");
  return { success: true };
}

export async function updateVehicle(
  id: string,
  input: Partial<{
    registration: string;
    make_model: string | null;
    seat_capacity: number;
    hold_capacity_units: number;
    wheelchair_capacity: number;
    current_mileage: number | null;
    notes: string | null;
    active: boolean;
  }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/vehicles");
  return { success: true };
}

export async function setVehicleStatus(
  id: string,
  status: VehicleStatus
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/vehicles");
  return { success: true };
}

/**
 * Assigns a vehicle to a departure, SNAPSHOTTING its current capacity
 * fields onto the new departure_vehicles row (build spec §7) — a later
 * edit to the vehicle's own capacity must never retroactively change a
 * departure that already ran with the old numbers.
 */
export async function assignVehicleToDeparture(input: {
  departure_id: string;
  vehicle_id: string;
  sequence?: number;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("seat_capacity, hold_capacity_units, wheelchair_capacity")
    .eq("id", input.vehicle_id)
    .single();

  if (vehicleError || !vehicle) return { error: "Vehicle not found." };

  const { error } = await supabase.from("departure_vehicles").insert({
    departure_id: input.departure_id,
    vehicle_id: input.vehicle_id,
    seats_capacity: vehicle.seat_capacity,
    hold_capacity_units: vehicle.hold_capacity_units,
    wheelchair_capacity: vehicle.wheelchair_capacity,
    sequence: input.sequence ?? 0,
  });
  if (error) return { error: error.message };

  revalidatePath(`/office/departures/${input.departure_id}`);
  return { success: true };
}
