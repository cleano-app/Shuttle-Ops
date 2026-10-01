import type { NextConfig } from "next";

// Domains this app talks to at runtime: this project's own Supabase
// instance (API + Storage), and Google Maps for the dashboard's driver map
// only (owner, 1 Oct 2026) - its script, map tiles and the Roboto font it
// loads. Addresses and routing still use the shuttle's own data (spec
// §2/§10); app fonts are bundled in the repo.
//
// Placeholder until the real Supabase project exists (see Phase 1 plan
// open decision #1) - update once NEXT_PUBLIC_SUPABASE_URL is known.
const SUPABASE_ORIGIN =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ??
  "https://placeholder.supabase.co";

// 'unsafe-inline' on script-src/style-src is the same pragmatic trade-off
// Cleano Ops makes: Next.js's hydration bootstrap and Tailwind's runtime
// style injection both rely on inline script/style tags. A nonce-based CSP
// is a real future improvement, not done here to match the existing
// project's baseline exactly.
const isDev = process.env.NODE_ENV === "development";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://maps.googleapis.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN} https://maps.googleapis.com https://maps.gstatic.com https://*.ggpht.com https://*.googleusercontent.com`,
  `connect-src 'self' ${SUPABASE_ORIGIN} https://maps.googleapis.com${isDev ? " ws://localhost:*" : ""}`,
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source:
          "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
