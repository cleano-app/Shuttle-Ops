// A route is stored once ("London ⇄ Antwerp") with each departure's
// direction alongside it. People think in journeys, not "route +
// direction" (owner, 1 Oct 2026), so screens show "London → Antwerp" /
// "Antwerp → London". Colours and flags per place: src/lib/places.ts and
// src/components/Journey.tsx.

export type Direction = "outbound" | "return" | string;

/** "London ⇄ Antwerp" + "return" -> "Antwerp → London". */
export function journeyLabel(routeName: string | null | undefined, direction: Direction): string {
  const name = routeName ?? "Route";
  const ends = name.split(/\s*(?:⇄|↔|<->)\s*|\s+[-–—/]\s+/).filter(Boolean);
  if (ends.length !== 2) return `${name} · ${direction}`;
  const [a, b] = ends;
  return direction === "return" ? `${b} → ${a}` : `${a} → ${b}`;
}
