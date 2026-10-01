import { Journey } from "./Journey";

/** Kept for existing callers: the journey with coloured, flagged pins. */
export function JourneyBadge({
  routeName,
  direction,
  className = "",
}: {
  routeName: string | null | undefined;
  direction: string;
  className?: string;
}) {
  return <Journey routeName={routeName} direction={direction} size="sm" className={className} />;
}
