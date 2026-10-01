"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { DepartureDirection, StopType } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
  message?: string;
}

function isDispatcherOrAbove(role: string) {
  return role === "admin" || role === "office" || role === "dispatcher";
}

const STOP_TYPES = new Set(["pickup", "dropoff", "crossing", "waypoint"]);

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
  if (!input.name.trim()) return { error: "Give the template a name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_templates")
    .insert({ ...input, name: input.name.trim() })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/office/dispatch");
  return { success: true, id: data.id };
}

export async function addTemplateStop(input: {
  template_id: string;
  address_id?: string | null;
  area_id?: string | null;
  sequence: number;
  default_offset_minutes?: number;
  stop_type?: StopType;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }
  if (input.stop_type && !STOP_TYPES.has(input.stop_type)) return { error: "Unknown stop type." };

  const supabase = await createClient();
  // stop_type (0060) is newer than the generated table types, so the row
  // is built as a plain object rather than a checked literal.
  const row = { ...input, stop_type: input.stop_type ?? "waypoint" };
  const { error } = await supabase.from("route_template_stops").insert(row as never);
  if (error) return { error: error.message };

  revalidatePath("/office/dispatch");
  return { success: true };
}

/**
 * "Save current stop order as template" (build spec §18): copies a
 * departure's stops - address, area, type and minutes after departure -
 * into a new route template for the same route and direction.
 */
export async function saveStopsAsTemplate(input: {
  departureId: string;
  name: string;
  notes?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }
  if (!input.name.trim()) return { error: "Give the template a name." };

  const supabase = await createClient();
  const { data: departure, error: depError } = await supabase
    .from("departures")
    .select("route_id, direction, depart_at")
    .eq("id", input.departureId)
    .single();
  if (depError || !departure) return { error: depError?.message ?? "Departure not found." };

  const { data: stops, error: stopsError } = await supabase
    .from("operational_stops")
    .select("address_id, stop_type, planned_sequence, planned_arrival_at, addresses(area_id)")
    .eq("departure_id", input.departureId)
    .order("planned_sequence", { ascending: true });
  if (stopsError) return { error: stopsError.message };
  if (!stops || stops.length === 0) return { error: "This departure has no stops to save." };

  const { data: template, error: tplError } = await supabase
    .from("route_templates")
    .insert({
      route_id: departure.route_id,
      direction: departure.direction,
      name: input.name.trim(),
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (tplError) return { error: tplError.message };

  const departMs = new Date(departure.depart_at).getTime();
  const rows = stops.map((s, i) => ({
    template_id: template.id,
    address_id: s.address_id,
    area_id: (s as unknown as { addresses?: { area_id?: string | null } }).addresses?.area_id ?? null,
    sequence: i,
    default_offset_minutes: s.planned_arrival_at
      ? Math.max(0, Math.round((new Date(s.planned_arrival_at).getTime() - departMs) / 60_000))
      : 0,
    stop_type: s.stop_type,
  }));
  const { error: rowsError } = await supabase.from("route_template_stops").insert(rows as never);
  if (rowsError) {
    // Don't leave an empty template behind.
    await supabase.from("route_templates").delete().eq("id", template.id);
    return { error: rowsError.message };
  }

  revalidatePath("/office/dispatch");
  revalidatePath(`/office/dispatch/${input.departureId}`);
  return {
    success: true,
    id: template.id,
    message: `Saved "${input.name.trim()}" with ${rows.length} stop${rows.length === 1 ? "" : "s"}.`,
  };
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
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) return { error: error.message, templates: [] };

  return { templates: data ?? [] };
}

export interface TemplateListItem {
  id: string;
  name: string;
  notes: string | null;
  direction: DepartureDirection;
  active: boolean;
  created_at: string;
  route_name: string;
  stops: {
    id: string;
    sequence: number;
    default_offset_minutes: number;
    stop_type: string;
    label: string;
  }[];
}

/** Every template (active and retired) for the dispatch index's manager. */
export async function listAllRouteTemplates(): Promise<{ error?: string; templates: TemplateListItem[] }> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized.", templates: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_templates")
    .select(
      "id, name, notes, direction, active, created_at, routes(name), route_template_stops(*, addresses(line1, postcode, fixed_point_name), areas(name))"
    )
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { error: error.message, templates: [] };

  type Raw = {
    id: string;
    name: string;
    notes: string | null;
    direction: DepartureDirection;
    active: boolean;
    created_at: string;
    routes?: { name?: string } | null;
    route_template_stops?: {
      id: string;
      sequence: number;
      default_offset_minutes: number;
      stop_type?: string | null;
      addresses?: { line1?: string; postcode?: string; fixed_point_name?: string | null } | null;
      areas?: { name?: string } | null;
    }[];
  };
  const templates = ((data ?? []) as unknown as Raw[]).map((t) => ({
    id: t.id,
    name: t.name,
    notes: t.notes,
    direction: t.direction,
    active: t.active,
    created_at: t.created_at,
    route_name: t.routes?.name ?? "Route",
    stops: (t.route_template_stops ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({
        id: s.id,
        sequence: s.sequence,
        default_offset_minutes: s.default_offset_minutes,
        stop_type: s.stop_type ?? "waypoint",
        label: s.addresses
          ? `${s.addresses.fixed_point_name ? `${s.addresses.fixed_point_name} — ` : ""}${s.addresses.line1 ?? ""}, ${s.addresses.postcode ?? ""}`
          : s.areas?.name
            ? `Somewhere in ${s.areas.name}`
            : "Unplaced stop",
      })),
  }));
  return { templates };
}

export async function setRouteTemplateActive(id: string, active: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("route_templates").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/office/dispatch");
  return { success: true, message: active ? "Template restored." : "Template retired." };
}

export async function deleteRouteTemplate(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("route_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/office/dispatch");
  return { success: true, message: "Template deleted." };
}

/**
 * Materializes a route template's stops onto a departure as
 * operational_stops (build spec §18). Only for a departure with no stops
 * yet - "Generate / Update stops from bookings" then slots passengers and
 * parcels in beside the template's stops by area.
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
  const { count, error: countError } = await supabase
    .from("operational_stops")
    .select("id", { count: "exact", head: true })
    .eq("departure_id", input.departureId);
  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) {
    return { error: "This departure already has stops. A template can only be applied to an empty departure." };
  }

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
    // An area-only template stop is a placeholder ("somewhere around
    // here", §18) - it has no address to drive to, so it isn't created.
    .filter((ts): ts is typeof ts & { address_id: string } => Boolean(ts.address_id))
    .map((ts, i) => {
      const t = (ts as unknown as { stop_type?: string | null }).stop_type;
      return {
        departure_id: input.departureId,
        address_id: ts.address_id,
        stop_type: (t && STOP_TYPES.has(t) ? t : "waypoint") as StopType,
        planned_sequence: i,
        planned_arrival_at: new Date(departAt.getTime() + ts.default_offset_minutes * 60_000).toISOString(),
      };
    });
  if (rows.length === 0) return { error: "None of this template's stops has an address." };

  const { error } = await supabase.from("operational_stops").insert(rows);
  if (error) return { error: error.message };

  revalidatePath(`/office/dispatch/${input.departureId}`);
  return {
    success: true,
    message: `Applied ${rows.length} template stop${rows.length === 1 ? "" : "s"}. Now run "Update stops from bookings" to add passengers and parcels.`,
  };
}
