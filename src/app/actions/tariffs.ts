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
