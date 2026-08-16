import type { CookieOptions } from "@supabase/ssr";

// @supabase/ssr's DEFAULT_COOKIE_OPTIONS sets path/sameSite=lax/maxAge
// sensibly but leaves `secure` unset. `httpOnly: false` is deliberate on
// their end; `secure` should always be on wherever this app runs in
// production (Vercel enforces HTTPS), just not on plain `next dev` over
// http://localhost. Copied from Cleano Ops's cookieOptions.ts.
export function withSecureCookieOptions(options: CookieOptions): CookieOptions {
  return {
    ...options,
    secure: process.env.NODE_ENV === "production",
  };
}
