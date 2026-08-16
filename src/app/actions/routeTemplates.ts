"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { DepartureDirection, StopType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}

export async function createRouteTemplate(input: {
  route_id: string;
  direction: DepartureDirection;
  name: string;
  notes?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_templates")
    .insert(input)
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/office/dispatch/templates");
  return { success: true, id: data.id };
}

export async function addTemplateStop(input: {
  template_id: string;
  address_id?: string | null;
  area_id?: string | null;
  sequence: number;
  default_offset_minutes?: number;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("route_template_stops").insert(input);
  if (error) return { error: error.message };

  revalidatePath("/office/dispatch/templates");
  return { success: true };
}

export async function listTemplatesForRoute(routeId: string, direction: DepartureDirection) {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", templates: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_templates")
    .select("*, route_template_stops(*)")
    .eq("route_id", routeId)
    .eq("direction", direction)
    .eq("active", true);
  if (error) return { error: error.message, templates: [] };

  return { templates: data ?? [] };
}

/**
 * Materializes a route template's stops onto a real departure as
 * operational_stops rows (build spec §18: "Dispatcher applies a standard
 * template to a new departure"). Existing stops for this departure are
 * left untouched — calling this twice would duplicate stops, so the
 * dispatch UI only offers it while the departure has none yet.
 */
export async function applyTemplateToDeparture(input: {
  templateId: string;
  departureId: string;
  departAt: string; // ISO — used to compute each stop's planned_arrival_at
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: templateStops, error: fetchError } = await supabase
    .from("route_template_stops")
    .select("*")
    .eq("template_id", input.templateId)
    .order("sequence", { ascending: true });
  if (fetchError) return { error: fetchError.message };
  if (!templateStops || templateStops.length === 0) {
    return { error: "This template has no stops yet." };
  }

  const departAt = new Date(input.departAt);
  const rows = templateStops
    // A template stop with only an area_id (no fixed address) is a
    // placeholder for "exceptional stops go somewhere around here" (§18) —
    // Office drags a real address in later rather than this materializing
    // a stop with no destination.
    .filter((ts): ts is typeof ts & { address_id: string } => Boolean(ts.address_id))
    .map((ts) => ({
      departure_id: input.departureId,
      address_id: ts.address_id,
      stop_type: "waypoint" as StopType,
      planned_sequence: ts.sequence,
      planned_arrival_at: new Date(departAt.getTime() + ts.default_offset_minutes * 60_000).toISOString(),
    }));

  const { error } = await supabase.from("operational_stops").insert(rows);
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${input.departureId}`);
  return { success: true };
}
