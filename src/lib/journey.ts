// A route is stored once ("London ⇄ Antwerp") with each departure's
// direction alongside it. People think in journeys, not "route +
// direction" (owner, 1 Oct 2026), so screens show "London → Antwerp" /
// "Antwerp → London", each direction in its own colour.

export type Direction = "outbound" | "return" | string;

/** "London ⇄ Antwerp" + "return" -> "Antwerp → London". */
export function journeyLabel(routeName: string | null | undefined, direction: Direction): string {
  const name = routeName ?? "Route";
  const ends = name.split(/\s*(?:⇄|↔|<->)\s*|\s+[-–—/]\s+/).filter(Boolean);
  if (ends.length !== 2) return `${name} · ${direction}`;
  const [a, b] = ends;
  return direction === "return" ? `${b} → ${a}` : `${a} → ${b}`;
}

/** Tailwind classes per direction: London → Antwerp indigo, Antwerp →
 * London orange. `badge` for a pill, `bar` for a coloured row edge, `text`
 * for inline text. */
export function journeyTone(direction: Direction) {
  return direction === "return"
    ? {
        badge: "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
        bar: "border-s-4 border-s-orange-500",
        text: "text-orange-700",
        dot: "bg-orange-500",
      }
    : {
        badge: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200",
        bar: "border-s-4 border-s-indigo-600",
        text: "text-indigo-700",
        dot: "bg-indigo-600",
      };
}
