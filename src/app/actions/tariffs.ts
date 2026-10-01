"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { DepartureDirection, PassengerCategory } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export interface TariffInput {
  route_id: string;
  direction?: DepartureDirection | null;
  category?: PassengerCategory | null;
  base_fare_gbp: number;
  base_fare_eur: number;
  luggage_large_allowance?: number;
  luggage_small_allowance?: number;
  luggage_hand_allowance?: number;
  luggage_additional_charge_gbp?: number;
  luggage_additional_charge_eur?: number;
  luggage_oversize_charge_gbp?: number;
  luggage_oversize_charge_eur?: number;
  capacity_units_per_large?: number;
  capacity_units_per_small?: number;
  capacity_units_per_oversize?: number;
}

export async function upsertTariff(
  input: TariffInput & { id?: string }
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "office")) {
    return { error: "Only Office/Admin can manage tariffs." };
  }

  const supabase = await createClient();
  const { id, ...rest } = input;
  const { error } = id
    ? await supabase.from("tariffs").update(rest).eq("id", id)
    : await supabase.from("tariffs").insert(rest);
  if (error) return { error: error.message };

  revalidatePath("/office/tariffs");
  return { success: true };
}

export async function listTariffsForRoute(routeId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated.", tariffs: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tariffs")
    .select("*")
    .eq("route_id", routeId)
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) return { error: error.message, tariffs: [] };

  return { tariffs: data ?? [] };
}

type Dir = DepartureDirection | null;
type Cat = PassengerCategory | null;

const LUGGAGE_FIELDS = [
  "luggage_large_allowance",
  "luggage_small_allowance",
  "luggage_hand_allowance",
  "luggage_additional_charge_gbp",
  "luggage_additional_charge_eur",
  "luggage_oversize_charge_gbp",
  "luggage_oversize_charge_eur",
  "capacity_units_per_large",
  "capacity_units_per_small",
  "capacity_units_per_oversize",
] as const;

function canEdit(role: string | undefined) {
  return role === "admin" || role === "office";
}

/**
 * One cell of the price list (auto-saved from /office/tariffs): the £ or €
 * fare for a route, journey direction (null = both) and passenger type
 * (null = everyone). An empty amount on an override removes the override
 * so the standard price applies again; the route's standard price can't be
 * removed, only changed. New overrides copy the luggage rules and the other
 * currency from the price they replace.
 */
export async function setPrice(input: {
  routeId: string;
  direction: Dir;
  category: Cat;
  currency: "GBP" | "EUR";
  amount: number | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !canEdit(session.role)) return { error: "Only Office/Admin can change prices." };
  if (input.amount != null && !(input.amount >= 0 && input.amount < 100000)) return { error: "Enter a price." };

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("tariffs")
    .select("*")
    .eq("route_id", input.routeId)
    .eq("active", true);
  if (error) return { error: error.message };
  const all = rows ?? [];
  const match = (d: Dir, c: Cat) => all.find((t) => t.direction === d && t.category === c);
  const exact = match(input.direction, input.category);
  const isStandard = input.direction === null && input.category === null;
  const column = input.currency === "GBP" ? "base_fare_gbp" : "base_fare_eur";

  if (input.amount == null) {
    if (!exact) return { success: true };
    if (isStandard) return { error: "The standard price can be changed but not left empty." };
    const { error: e } = await supabase.from("tariffs").update({ active: false }).eq("id", exact.id);
    if (e) return { error: e.message };
  } else if (exact) {
    const { error: e } = await supabase
      .from("tariffs")
      .update(column === "base_fare_gbp" ? { base_fare_gbp: input.amount } : { base_fare_eur: input.amount })
      .eq("id", exact.id);
    if (e) return { error: e.message };
  } else {
    // Inherit from the next price up, the same order pickTariff uses.
    const parent =
      (input.category ? match(null, input.category) : undefined) ??
      (input.direction ? match(input.direction, null) : undefined) ??
      match(null, null);
    const luggage = Object.fromEntries(LUGGAGE_FIELDS.map((k) => [k, parent ? parent[k] : undefined]).filter(([, v]) => v != null));
    const { error: e } = await supabase.from("tariffs").insert({
      route_id: input.routeId,
      direction: input.direction,
      category: input.category,
      base_fare_gbp: input.currency === "GBP" ? input.amount : parent?.base_fare_gbp ?? input.amount,
      base_fare_eur: input.currency === "EUR" ? input.amount : parent?.base_fare_eur ?? input.amount,
      ...luggage,
    });
    if (e) return { error: e.message };
  }
  revalidatePath("/office/tariffs");
  return { success: true };
}

/** Luggage rules for a whole route: written to every active price row so
 * whichever row a passenger is priced from, the same rules apply. */
export async function setRouteLuggage(
  routeId: string,
  values: Partial<Record<(typeof LUGGAGE_FIELDS)[number], number>>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !canEdit(session.role)) return { error: "Only Office/Admin can change prices." };
  const clean = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => (LUGGAGE_FIELDS as readonly string[]).includes(k) && Number.isFinite(v) && (v as number) >= 0)
  );
  if (Object.keys(clean).length === 0) return { error: "Nothing to save." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tariffs")
    .update(clean as Partial<Record<(typeof LUGGAGE_FIELDS)[number], number>>)
    .eq("route_id", routeId)
    .eq("active", true);
  if (error) return { error: error.message };
  revalidatePath("/office/tariffs");
  return { success: true };
}
