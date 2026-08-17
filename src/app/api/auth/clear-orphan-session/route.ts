import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Build spec Phase 5 fallout: a Supabase-authenticated user with NO
 * matching `profiles` row AND no passenger_account_users/
 * organization_account_users link is now a real, reachable state (found
 * live: a passenger row got swept by scripts/clean-test-data.ts because
 * its name matched the "Test Passenger %" pattern, leaving its still-
 * valid browser session orphaned). Root `/` (src/app/page.tsx) redirects
 * here instead of straight to /login for that specific case — plain
 * Server Components can't call supabase.auth.signOut() themselves
 * (writing cookies during render is disallowed outside a Server Action/
 * Route Handler), and without an actual sign-out, proxy.ts's "redirect an
 * authenticated user away from /login" rule bounces them straight back to
 * `/`, which — still unable to resolve any session — sends them to
 * /login again: an infinite loop between the two pages, confirmed live.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
