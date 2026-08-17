"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { pickNextWaitlistOffer } from "@/lib/waitlist/pickNextOffer";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

export async function addToWaitlist(input: {
  departureId: string;
  passengerId: string;
  seatsWanted?: number;
  luggageEstimate?: number;
  wheelchairRequirement?: boolean;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({
    departure_id: input.departureId,
    passenger_id: input.passengerId,
    seats_wanted: input.seatsWanted ?? 1,
    luggage_estimate: input.luggageEstimate ?? 0,
    wheelchair_requirement: input.wheelchairRequirement ?? false,
  });
  if (error) return { error: error.message };

  revalidatePath(`/office/departures/${input.departureId}`);
  return { success: true };
}

export async function listWaitlistForDeparture(departureId: string) {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized.", entries: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("waitlist")
    .select("*, passengers(full_name, phone)")
    .eq("departure_id", departureId)
    .in("status", ["waiting", "offered"])
    .order("created_at", { ascending: true });
  if (error) return { error: error.message, entries: [] };

  return { entries: data ?? [] };
}

/**
 * Build spec §13: "When capacity frees, the system reruns the full
 * capacity check before making an offer... If they don't fit, skip to the
 * next entry and leave the first waiting." Tries entries in FIFO order,
 * stops at the first one that actually fits — never silently skips
 * everyone just because the first doesn't fit.
 */
export async function offerNextWaiting(departureId: string): Promise<ActionResult & { offeredTo?: string }> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: entries, error: fetchError } = await supabase
    .from("waitlist")
    .select("*")
    .eq("departure_id", departureId)
    .eq("status", "waiting")
    .order("created_at", { ascending: true });
  if (fetchError) return { error: fetchError.message };

  const { data: summary } = await supabase
    .from("departure_capacity_summary")
    .select("seats_released, seats_used, hold_capacity_units, hold_used, wheelchair_capacity, wheelchair_used")
    .eq("departure_id", departureId)
    .maybeSingle();
  if (!summary) return { success: true, offeredTo: undefined };

  const picked = pickNextWaitlistOffer(entries ?? [], summary);
  if (!picked) return { success: true, offeredTo: undefined };

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  const { error } = await supabase
    .from("waitlist")
    .update({ status: "offered", notified_at: new Date().toISOString(), expires_at: expiresAt.toISOString() })
    .eq("id", picked.id);
  if (error) return { error: error.message };

  revalidatePath(`/office/departures/${departureId}`);
  return { success: true, offeredTo: picked.passenger_id };
}

export async function markWaitlistConverted(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").update({ status: "converted" }).eq("id", id);
  if (error) return { error: error.message };

  return { success: true };
}

export async function markWaitlistLapsed(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").update({ status: "lapsed" }).eq("id", id);
  if (error) return { error: error.message };

  return { success: true };
}
