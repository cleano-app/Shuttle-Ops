"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPortalSession } from "@/lib/auth/portalSession";
import type { MyOrganization, MyReferredPassenger, MySponsoredBooking, PassengerCategory } from "@/types/database";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function getMyOrganization(): Promise<{ error?: string; organization?: MyOrganization }> {
  const session = await getPortalSession();
  if (!session || session.kind !== "organization") {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_organization");
  if (error) return { error: error.message };

  const organization = (data as MyOrganization[] | null)?.[0];
  if (!organization) return { error: "Organization not found." };
  return { organization };
}

/** Build spec Phase 5 (§39): a referrer puts a passenger forward. Always
 * creates a brand new passengers row (refer_passenger, 0051) — see that
 * migration's comment for why this never tries to match an existing one. */
export async function referPassenger(input: {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  category?: PassengerCategory;
  preferredLanguage?: string | null;
}): Promise<ActionResult & { passengerId?: string }> {
  const session = await getPortalSession();
  if (!session || session.kind !== "organization" || session.orgType !== "referrer") {
    return { error: "Not authorized." };
  }
  if (!input.fullName.trim()) {
    return { error: "Name is required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("refer_passenger", {
    p_full_name: input.fullName,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_category: input.category ?? "man",
    p_preferred_language: input.preferredLanguage ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/portal/referrer/dashboard");
  return { success: true, passengerId: data as string };
}

export async function listMyReferredPassengers(): Promise<{
  error?: string;
  passengers: MyReferredPassenger[];
}> {
  const session = await getPortalSession();
  if (!session || session.kind !== "organization") {
    return { error: "Not authorized.", passengers: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_referred_passengers");
  if (error) return { error: error.message, passengers: [] };

  return { passengers: (data ?? []) as MyReferredPassenger[] };
}

export async function listMySponsoredBookings(): Promise<{
  error?: string;
  bookings: MySponsoredBooking[];
}> {
  const session = await getPortalSession();
  if (!session || session.kind !== "organization") {
    return { error: "Not authorized.", bookings: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_sponsored_bookings");
  if (error) return { error: error.message, bookings: [] };

  return { bookings: (data ?? []) as MySponsoredBooking[] };
}
