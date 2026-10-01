import type { ZmanIcon as ZmanIconName } from "@/lib/zmanim";

/** Small line icons for each zman, coloured by time of day. */
export function ZmanIcon({ name, className = "h-5 w-5" }: { name: ZmanIconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `shrink-0 ${className}`,
    "aria-hidden": true,
  };
  switch (name) {
    case "sunrise":
      return (
        <svg {...common} stroke="#f59e0b">
          <path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0" />
          <path d="M12 4v4M9.5 6.5 12 4l2.5 2.5M4.2 11.2l1.4 1.4M19.8 11.2l-1.4 1.4" />
        </svg>
      );
    case "shema":
      return (
        <svg {...common} stroke="#4f46e5">
          <path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2Z" />
          <path d="M12 6.5v13" />
        </svg>
      );
    case "tefillah":
      return (
        <svg {...common} stroke="#7c3aed">
          <path d="M12 3c-1.2 2-3.5 3.5-3.5 7v4.5L6 20h12l-2.5-5.5V10c0-3.5-2.3-5-3.5-7Z" />
          <path d="M12 7v10" />
        </svg>
      );
    case "chatzos":
      return (
        <svg {...common} stroke="#eab308">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      );
    case "mincha":
      return (
        <svg {...common} stroke="#f97316">
          <circle cx="15" cy="10" r="3.5" />
          <path d="M3 19h18M15 3.5v1.5M20.5 10H22M19.2 5.8l1-1M10.8 5.8l-1-1" />
          <path d="M5 15.5c2-1 4-1 6 0" />
        </svg>
      );
    case "candles":
      return (
        <svg {...common} stroke="#d97706">
          <path d="M8 21V11M16 21V11M6 21h4M14 21h4" />
          <path d="M8 4.5c1 1.2 1 2.6 0 3.5-1-.9-1-2.3 0-3.5ZM16 4.5c1 1.2 1 2.6 0 3.5-1-.9-1-2.3 0-3.5Z" fill="#fbbf24" />
        </svg>
      );
    case "sunset":
      return (
        <svg {...common} stroke="#ea580c">
          <path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0" />
          <path d="M12 9V4M9.5 6.5 12 9l2.5-2.5M4.2 11.2l1.4 1.4M19.8 11.2l-1.4 1.4" />
        </svg>
      );
    case "tzeis":
      return (
        <svg {...common} stroke="#1e3a8a">
          <path d="M15.5 4.5a7.5 7.5 0 1 0 4 13.5 6.5 6.5 0 0 1-4-13.5Z" />
          <path d="M6 5l.6 1.4L8 7l-1.4.6L6 9l-.6-1.4L4 7l1.4-.6L6 5ZM20 9l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4.4-.9Z" fill="#1e3a8a" />
        </svg>
      );
    case "havdalah":
      return (
        <svg {...common} stroke="#b45309">
          <path d="M9 21l1.5-10M15 21l-1.5-10M12 21V11M9.5 11h5" />
          <path d="M12 3c2 2 2.5 4 0 6-2.5-2-2-4 0-6Z" fill="#f59e0b" />
        </svg>
      );
  }
}
