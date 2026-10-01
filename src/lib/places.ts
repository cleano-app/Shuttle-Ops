// Each end of a route has its own colour and flag (owner, 1 Oct 2026:
// "London blue, Antwerp red, UK flag for London and Belgium flag for
// Antwerp, both 📍 with the flag in the bulb"). Matched on the place name
// as written in the route name; anything unknown falls back to its
// country's flag (if it can be guessed) in slate.

export type Country = "GB" | "BE" | "NL" | "FR" | "unknown";

export interface PlaceStyle {
  name: string;
  country: Country;
  /** Hex colour used for the pin and the name. */
  color: string;
}

const KNOWN: { match: RegExp; country: Country; color: string }[] = [
  { match: /london|stamford|golders|hendon/i, country: "GB", color: "#1d4ed8" }, // blue
  { match: /antwerp|antwerpen|anvers/i, country: "BE", color: "#dc2626" }, // red
  { match: /manchester|salford|broughton|prestwich/i, country: "GB", color: "#059669" }, // green
  { match: /amsterdam|rotterdam/i, country: "NL", color: "#ea580c" },
  { match: /paris/i, country: "FR", color: "#7c3aed" },
];

export function placeStyle(name: string): PlaceStyle {
  const hit = KNOWN.find((k) => k.match.test(name));
  return hit ? { name, country: hit.country, color: hit.color } : { name, country: "unknown", color: "#475569" };
}

/** Both ends of a route, in travel order for this direction. */
export function journeyEnds(routeName: string | null | undefined, direction: string): [string, string] | null {
  const ends = (routeName ?? "").split(/\s*(?:⇄|↔|<->)\s*|\s+[-–—/]\s+/).filter(Boolean);
  if (ends.length !== 2) return null;
  return direction === "return" ? [ends[1], ends[0]] : [ends[0], ends[1]];
}
