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

  // getUser() revalidates against Supabase (unlike getSession(), which just
  // trusts the cookie) - wrapped defensively so a transient Supabase outage
  // degrades to "treat as logged out" rather than a 500 on every request.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  const isPublicRoute =
    path === "/login" || path === "/forgot-password" || path === "/reset-password";

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicRoute) {
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
