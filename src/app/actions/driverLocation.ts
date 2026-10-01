"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

export interface LiveDriverLocation {
  driverId: string;
  driverName: string;
  phone: string | null;
  departureId: string | null;
  vehicle: string | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  recordedAt: string;
}

/** Driver's phone -> one position fix (driver_locations, migration 0062). */
export async function recordMyLocation(input: {
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  departureId?: string | null;
}): Promise<{ error?: string; success?: boolean }> {
  const session = await getSession();
  if (!session || session.role !== "driver") return { error: "Only drivers send a location." };
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return { error: "Invalid position." };

  const supabase = await createClient();
  const { error } = await supabase.from("driver_locations").insert({
    driver_id: session.userId,
    departure_id: input.departureId ?? null,
    lat: input.lat,
    lng: input.lng,
    accuracy_m: input.accuracy ?? null,
    heading: input.heading ?? null,
    speed_mps: input.speed ?? null,
  });
  if (error) return { error: error.message };
  return { success: true };
}

/** Latest fix per driver from the last 12 hours, for the dashboard map. */
export async function getLiveDriverLocations(): Promise<{ error?: string; locations: LiveDriverLocation[] }> {
  const session = await getSession();
  if (!session || session.role === "driver") return { error: "Not authorized.", locations: [] };

  const supabase = await createClient();
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
  )("get_live_driver_locations", { p_hours: 12 });
  if (error) return { error: error.message, locations: [] };
  return {
    locations: (data ?? []).map((r) => ({
      driverId: String(r.driver_id),
      driverName: String(r.driver_name ?? "Driver"),
      phone: (r.phone as string | null) ?? null,
      departureId: (r.departure_id as string | null) ?? null,
      vehicle: (r.vehicle_registration as string | null) ?? null,
      lat: Number(r.lat),
      lng: Number(r.lng),
      accuracyM: r.accuracy_m == null ? null : Number(r.accuracy_m),
      recordedAt: String(r.recorded_at),
    })),
  };
}
