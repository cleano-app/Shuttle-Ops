"use client";

// Google Maps JS loader, copied from Cleano Ops's src/lib/googleMaps.ts.
// Caches the load promise so the script loads once per page.
let scriptLoadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      // Don't cache a permanent failure - a fixed API key (restrictions
      // relaxed, billing enabled, Places API turned on) should be able to
      // succeed on the next mount/retry instead of replaying this rejection
      // forever for the lifetime of the page.
      scriptLoadPromise = null;
      // This is the one place that sees Google's actual failure reason;
      // callers (e.g. AddressFields) only get a generic "unavailable"
      // message, so this is the only record of what really went wrong (bad
      // key, referrer restriction, Places API not enabled, billing
      // disabled, network block, etc).
      console.error("[googleMaps] failed to load Google Maps JS API:", err);
      reject(err);
    };

    // Google reports API-key/config problems (InvalidKeyMapError,
    // ApiNotActivatedMapError, RefererNotAllowedMapError, billing not
    // enabled, ...) through this global callback, not by failing the
    // <script> load - onload still fires normally in that case, so without
    // this hook those failures never reach loadGoogleMapsScript's caller at
    // all and the autocomplete just silently does nothing.
    (window as typeof window & { gm_authFailure?: () => void }).gm_authFailure = () => {
      fail(
        new Error(
          "Google Maps JavaScript API auth failure - check the API key's restrictions (this site's address must be allowed) and billing status."
        )
      );
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    script.onerror = () => fail(new Error("Could not load Google Maps."));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}
