import { journeyLabel, journeyTone, type Direction } from "@/lib/journey";

/** "London → Antwerp" pill in that direction's colour. */
export function JourneyBadge({
  routeName,
  direction,
  className = "",
}: {
  routeName: string | null | undefined;
  direction: Direction;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium ${journeyTone(direction).badge} ${className}`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${journeyTone(direction).dot}`} />
      {journeyLabel(routeName, direction)}
    </span>
  );
}
