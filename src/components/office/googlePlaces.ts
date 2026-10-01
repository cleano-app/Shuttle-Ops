"use client";

import { loadGoogleMapsScript } from "@/lib/googleMaps";

// Online address search (owner, 1 Oct 2026: "find online — decide if
// Google Places is OK"). Used only when Office types an address that isn't
// in our own address book yet; the chosen result is then saved to the
// address book, so a regular passenger's address never goes to Google
// twice. UK and Belgium only.

export interface PlaceSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export interface PlaceAddress {
  line1: string;
  city: string;
  postcode: string;
  country: "GB" | "BE";
}

let session: google.maps.places.AutocompleteSessionToken | null = null;

async function ready(): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return false;
  try {
    await loadGoogleMapsScript(key);
    return Boolean(window.google?.maps?.places);
  } catch {
    return false;
  }
}

/** Address predictions for `query`; [] when Google isn't available. */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (query.trim().length < 3 || !(await ready())) return [];
  session ??= new google.maps.places.AutocompleteSessionToken();
  const service = new google.maps.places.AutocompleteService();
  return new Promise((resolve) => {
    service.getPlacePredictions(
      {
        input: query,
        componentRestrictions: { country: ["gb", "be"] },
        types: ["address"],
        sessionToken: session!,
      },
      (predictions) =>
        resolve(
          (predictions ?? []).slice(0, 5).map((p) => ({
            placeId: p.place_id,
            main: p.structured_formatting.main_text,
            secondary: p.structured_formatting.secondary_text ?? "",
          }))
        )
    );
  });
}

/** Street address parts for a chosen prediction. */
export async function placeAddress(placeId: string): Promise<PlaceAddress | null> {
  if (!(await ready())) return null;
  const service = new google.maps.places.PlacesService(document.createElement("div"));
  const token = session;
  session = null; // a session ends with the details call
  return new Promise((resolve) => {
    service.getDetails(
      { placeId, fields: ["address_components"], sessionToken: token ?? undefined },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.address_components) return resolve(null);
        const get = (type: string, short = false) => {
          const c = place.address_components!.find((x) => x.types.includes(type));
          return c ? (short ? c.short_name : c.long_name) : "";
        };
        const country = get("country", true) === "BE" ? "BE" : "GB";
        const number = get("street_number");
        const street = get("route");
        // UK style "14 Olinda Road", Belgian style "Lange Kievitstraat 64".
        const line1 = country === "BE" ? [street, number].filter(Boolean).join(" ") : [number, street].filter(Boolean).join(" ");
        resolve({
          line1: line1 || get("premise") || get("subpremise"),
          city: get("postal_town") || get("locality"),
          postcode: get("postal_code"),
          country,
        });
      }
    );
  });
}
