"use server";

import { createClient } from "@/lib/supabase/server";
import type { PublicDepartureAvailability } from "@/types/database";

// Deliberately no auth check beyond "some client" — list_public_departures/
// get_public_departure_availability (0050) are granted to `anon` too, so a
// visitor can browse availability before signing up. Booking itself still
// requires a portal session (portalBookings.ts).
export async function listPublicDepartures(): Promise<{
  error?: string;
  departures: PublicDepartureAvailability[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_departures", { p_limit: 30 });
  if (error) return { error: error.message, departures: [] };

  return { departures: (data ?? []) as PublicDepartureAvailability[] };
}

export async function getDepartureAvailability(
  departureId: string
): Promise<{ error?: string; availability?: PublicDepartureAvailability }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_departure_availability", {
    p_departure_id: departureId,
  });
  if (error) return { error: error.message };

  const availability = (data as PublicDepartureAvailability[] | null)?.[0];
  if (!availability) return { error: "Departure not found." };
  return { availability };
}
