import { journeyEnds, placeStyle, type Country } from "@/lib/places";

/** The national flag, drawn into a 20×20 box (it gets clipped to a circle). */
function Flag({ country }: { country: Country }) {
  switch (country) {
    case "GB":
      return (
        <g>
          <rect width="20" height="20" fill="#012169" />
          <path d="M0 0L20 20M20 0L0 20" stroke="#fff" strokeWidth="4" />
          <path d="M0 0L20 20M20 0L0 20" stroke="#C8102E" strokeWidth="1.6" />
          <path d="M10 0V20M0 10H20" stroke="#fff" strokeWidth="6" />
          <path d="M10 0V20M0 10H20" stroke="#C8102E" strokeWidth="3.4" />
        </g>
      );
    case "BE":
      return (
        <g>
          <rect width="7" height="20" fill="#000" />
          <rect x="6.67" width="6.67" height="20" fill="#FDDA24" />
          <rect x="13.33" width="6.67" height="20" fill="#EF3340" />
        </g>
      );
    case "NL":
      return (
        <g>
          <rect width="20" height="7" fill="#AE1C28" />
          <rect y="6.67" width="20" height="6.67" fill="#fff" />
          <rect y="13.33" width="20" height="6.67" fill="#21468B" />
        </g>
      );
    case "FR":
      return (
        <g>
          <rect width="7" height="20" fill="#002654" />
          <rect x="6.67" width="6.67" height="20" fill="#fff" />
          <rect x="13.33" width="6.67" height="20" fill="#CE1126" />
        </g>
      );
    default:
      return <rect width="20" height="20" fill="#fff" />;
  }
}

/** A map pin in the place's colour with its flag in the round head. */
export function PlacePin({ country, color, size = 18 }: { country: Country; color: string; size?: number }) {
  // Same id for every pin: the clip circle is identical everywhere, so a
  // repeated id is harmless, and it keeps this usable in server components.
  const clip = "place-pin-head";
  return (
    <svg
      viewBox="0 0 24 32"
      width={size * 0.75}
      height={size}
      aria-hidden
      className="inline-block shrink-0 align-[-0.15em]"
    >
      <path d="M12 31C12 31 2 18.5 2 11.5a10 10 0 0 1 20 0C22 18.5 12 31 12 31Z" fill={color} />
      <clipPath id={clip}>
        <circle cx="12" cy="11.5" r="7.2" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <g transform="translate(4.8 4.3) scale(0.72)">
          <Flag country={country} />
        </g>
      </g>
      <circle cx="12" cy="11.5" r="7.2" fill="none" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}

function Place({ name, size }: { name: string; size: number }) {
  const p = placeStyle(name);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: p.color }}>
      <PlacePin country={p.country} color={p.color} size={size} />
      <span className="font-semibold">{name}</span>
    </span>
  );
}

/**
 * "📍London → 📍Antwerp", each end in its own colour with its flag in the
 * pin. Falls back to the plain route name when it doesn't have two ends.
 */
export function Journey({
  routeName,
  direction,
  size = "md",
  className = "",
}: {
  routeName: string | null | undefined;
  direction: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const ends = journeyEnds(routeName, direction);
  const px = size === "lg" ? 26 : size === "sm" ? 15 : 18;
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  if (!ends) {
    return (
      <span className={`${text} font-semibold text-slate-800 ${className}`}>
        {routeName ?? "Route"} · {direction}
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 ${text} ${className}`}>
      <Place name={ends[0]} size={px} />
      <span aria-label="to" className="text-slate-400">
        →
      </span>
      <Place name={ends[1]} size={px} />
    </span>
  );
}

/** Colour of where a journey starts — for the edge stripe on list rows. */
export function journeyStartColor(routeName: string | null | undefined, direction: string): string {
  const ends = journeyEnds(routeName, direction);
  return ends ? placeStyle(ends[0]).color : "#cbd5e1";
}
