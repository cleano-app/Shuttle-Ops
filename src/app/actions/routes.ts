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

export async function createRoute(input: {
  name: string;
  code?: string | null;
  origin_area_id?: string | null;
  destination_area_id?: string | null;
  supports_return?: boolean;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("routes").insert(input);
  if (error) return { error: error.message };

  revalidatePath("/office/departures");
  return { success: true };
}

export async function updateRoute(
  id: string,
  input: Partial<{
    name: string;
    code: string | null;
    origin_area_id: string | null;
    destination_area_id: string | null;
    supports_return: boolean;
    active: boolean;
  }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("routes").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/departures");
  return { success: true };
}
