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

export async function createArea(input: {
  name: string;
  country: string;
  running_order?: number;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("areas").insert(input);
  if (error) return { error: error.message };

  revalidatePath("/office/areas");
  return { success: true };
}

export async function updateArea(
  id: string,
  input: Partial<{ name: string; country: string; running_order: number }>
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("areas").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/areas");
  return { success: true };
}

export async function setAreaActive(id: string, active: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("areas").update({ active }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/office/areas");
  return { success: true };
}

export async function reorderAreas(
  order: { id: string; running_order: number }[]
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isDispatcherOrAbove(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  for (const { id, running_order } of order) {
    const { error } = await supabase.from("areas").update({ running_order }).eq("id", id);
    if (error) return { error: error.message };
  }

  revalidatePath("/office/areas");
  return { success: true };
}
