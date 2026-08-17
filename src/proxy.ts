import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { withSecureCookieOptions } from "@/lib/supabase/cookieOptions";

// Optimistic auth check only (per Next.js guidance: real authorization
// happens in layouts/DAL via getSession()). Mainly refreshes the Supabase
// session cookie on every request, since Server Components can't write
// cookies during render. Next.js 16 file convention is `proxy.ts`, not
// `middleware.ts` (verified against the docs shipped in
// node_modules/next/dist/docs and against Cleano Ops's own proxy.ts).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Both client construction AND getUser() are inside this try/catch —
  // not just getUser(). @supabase/ssr's createServerClient throws
  // synchronously (before any network call) if the URL/key come through
  // empty, e.g. NEXT_PUBLIC_SUPABASE_URL missing from the deployment's
  // env vars — confirmed live: that exact misconfiguration 500'd every
  // request in Middleware with zero outgoing requests logged, because the
  // original version here only wrapped getUser(), not construction. A
  // misconfigured/unreachable Supabase should degrade to "treat as logged
  // out" (redirect to /login), never crash the whole app.
  let user = null;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, withSecureCookieOptions(options))
            );
          },
        },
      }
    );
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  const isStaffPublicRoute =
    path === "/login" || path === "/forgot-password" || path === "/reset-password";
  // Passenger/referrer portal (build spec Phase 5, §39) has its own login
  // separate from staff — a portal user is never expected to have a
  // `profiles` row, so it can't share /login's redirect target or
  // "logged in" definition (that's resolved at the layout level via
  // getPortalSession(), not here — this check only knows Supabase auth
  // has SOME user, not which kind of account).
  const isPortalRoute = path.startsWith("/portal");
  const isPortalPublicRoute =
    path === "/portal/login" ||
    path === "/portal/signup" ||
    path === "/portal/forgot-password" ||
    path === "/portal/reset-password";

  if (!user && isPortalRoute && !isPortalPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    return NextResponse.redirect(url);
  }

  if (!user && !isPortalRoute && !isStaffPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isStaffPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (user && isPortalPublicRoute) {
    // NOT a hardcoded /portal/dashboard — this Supabase session might
    // belong to a STAFF account (or, allocate_booking_capacity aside,
    // someone with no portal link at all) visiting a portal auth page
    // directly, which has no passenger_account_users/
    // organization_account_users row at all. Redirecting straight to
    // /portal/dashboard for every authenticated user caused an infinite
    // loop: (app)/layout.tsx's own getPortalSession() check would find
    // nothing, bounce to /portal/login, which — still authenticated —
    // bounced right back here. Root `/` already has the full staff-then-
    // portal session resolution (src/app/page.tsx) and sends everyone to
    // the right place, or /login if neither kind of session exists.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
