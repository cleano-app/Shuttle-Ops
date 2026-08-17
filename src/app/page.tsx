import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPortalSession } from "@/lib/auth/portalSession";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const session = await getSession();

  // redirect() throws internally - the `return` is defensive style, matching
  // Cleano Ops's root page.tsx.
  if (session) {
    if (session.role === "driver") return redirect("/driver");
    return redirect("/office/dashboard");
  }

  // A Supabase-authenticated user with no `profiles` row is a portal user
  // (passenger or referrer org, build spec Phase 5) — getSession() above
  // returns null for them since it requires a profiles row, but they're
  // still logged in, so sending them to /login (staff) would be wrong.
  const portalSession = await getPortalSession();
  if (portalSession) {
    return redirect(portalSession.kind === "organization" ? "/portal/referrer/dashboard" : "/portal/dashboard");
  }

  // Neither session type resolved. If a Supabase session genuinely exists
  // (an authenticated user with no profiles row AND no passenger_account_
  // users/organization_account_users link at all — a real, reachable
  // state: confirmed live when a passenger's linked record got deleted
  // out from under an active session), redirecting straight to /login
  // would loop forever: proxy.ts bounces an authenticated user OFF /login
  // back to `/`, which lands right back here. Route through a Route
  // Handler that can actually sign them out first (a plain Server
  // Component render, unlike a Route Handler, can't write cookies).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return redirect("/api/auth/clear-orphan-session");
  }

  return redirect("/login");
}
