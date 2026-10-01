import type { MetadataRoute } from "next";

/**
 * Makes the app installable ("Install app" rather than "Create shortcut"),
 * same as Cleano Ops. Deliberately no service worker: installability needs
 * only a manifest + HTTPS, and a cached ops app can show yesterday's
 * manifest.
 *
 * start_url "/" because the root page already routes office, driver and
 * portal users to their own home.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shuttle Ops",
    short_name: "Shuttle Ops",
    description: "Booking, dispatch and charitable subsidy management for the London ⇄ Antwerp shuttle.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2a1f5c",
    categories: ["business", "productivity", "travel"],
    icons: [
      // PNGs for launchers and iOS that don't take SVG; SVG for the rest.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
