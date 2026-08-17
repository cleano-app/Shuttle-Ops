import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { OrgType } from "@/types/database";

// Separate from getSession() (src/lib/auth/session.ts) deliberately —
// staff sessions resolve through `profiles`, which passengers/referrer
// orgs never get a row in (build spec Phase 5, §39). A portal user is
// identified by a passenger_account_users or organization_account_users
// link instead. A user is never expected to hold both kinds of link at
// once (passenger self-signup and Office-linked org accounts are
// separate flows) — if that ever changes, this resolves passenger first.
export interface PortalSession {
  userId: string;
  email: string | null;
  kind: "passenger" | "organization";
  passengerId?: string;
  organizationId?: string;
  orgType?: OrgType;
}

export const getPortalSession = cache(async (): Promise<PortalSession | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: pau } = await supabase
    .from("passenger_account_users")
    .select("passenger_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (pau) {
    return { userId: user.id, email: user.email ?? null, kind: "passenger", passengerId: pau.passenger_id };
  }

  const { data: oau } = await supabase
    .from("organization_account_users")
    .select("organization_id, organizations(org_type)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (oau) {
    const orgType = (oau as unknown as { organizations?: { org_type: OrgType } }).organizations?.org_type;
    return {
      userId: user.id,
      email: user.email ?? null,
      kind: "organization",
      organizationId: oau.organization_id,
      orgType,
    };
  }

  return null;
});
