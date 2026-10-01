// Line icons for the app shell, drawn in Cleano Ops's style: 24px grid,
// currentColor stroke, round caps. Several are Cleano's own paths (home,
// calendar, users, wallet, receipt, bar chart, settings, user); the rest
// are new for shuttle work. Referenced by name so server layouts can pass
// them to client shell components as plain strings.

export type IconName =
  | "home"
  | "ticket"
  | "calendar"
  | "route"
  | "users"
  | "package"
  | "x-circle"
  | "bus"
  | "wrench"
  | "wallet"
  | "bar-chart"
  | "receipt"
  | "tag"
  | "map-pin"
  | "building"
  | "clipboard-check"
  | "user"
  | "settings"
  | "user-plus"
  | "heart"
  | "sign-out";

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M4 11.5L12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v8a1 1 0 001 1h10a1 1 0 001-1v-8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  ticket: (
    <>
      <path
        d="M3.5 7.5A1.5 1.5 0 015 6h14a1.5 1.5 0 011.5 1.5V10a2 2 0 000 4v2.5A1.5 1.5 0 0119 18H5a1.5 1.5 0 01-1.5-1.5V14a2 2 0 000-4V7.5z"
        strokeLinejoin="round"
      />
      <path d="M14.5 6.5v2M14.5 11v2M14.5 15.5v2" strokeLinecap="round" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" strokeLinecap="round" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M6 8v3a3 3 0 003 3h6a3 3 0 013 3v1" strokeLinecap="round" strokeDasharray="1 3.2" />
    </>
  ),
  users: (
    <>
      <circle cx="8.5" cy="8" r="3.2" />
      <circle cx="16" cy="9" r="2.6" />
      <path d="M2.5 20c0-3.4 2.7-6.2 6-6.2s6 2.8 6 6.2M14.5 14.5c2.7.4 4.9 2.7 4.9 5.5" strokeLinecap="round" />
    </>
  ),
  package: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeLinejoin="round" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" strokeLinejoin="round" />
    </>
  ),
  "x-circle": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
    </>
  ),
  bus: (
    <>
      <rect x="4.5" y="3.5" width="15" height="14" rx="2.5" />
      <path d="M4.5 11h15M4.5 7.5h15" />
      <path d="M7 17.5V20M17 17.5V20" strokeLinecap="round" />
      <circle cx="8" cy="14.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14.25" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  wrench: (
    <path
      d="M14.5 4.5a4 4 0 00-4.9 5.2L4 15.3a1.8 1.8 0 002.6 2.6l5.6-5.6a4 4 0 005.2-4.9l-2.4 2.4-2.2-.4-.4-2.2 2.1-2.7z"
      strokeLinejoin="round"
    />
  ),
  wallet: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path
        d="M12 7.5v9M14.5 9.75c0-1.1-1.12-2-2.5-2s-2.5.9-2.5 2c0 1.1 1.12 1.5 2.5 1.75s2.5.9 2.5 2c0 1.1-1.12 2-2.5 2s-2.5-.9-2.5-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  "bar-chart": (
    <>
      <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" />
      <path d="M2.5 20h19" strokeLinecap="round" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-2.5-1.5L13 21l-1.5-1.5L10 21l-2.5-1.5L6 21V3z" strokeLinejoin="round" />
      <path d="M8.5 8h7M8.5 12h7" strokeLinecap="round" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.3V4.5a1 1 0 011-1h7.8l8.2 8.2a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0l-8.2-8.2z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  "map-pin": (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="10" height="18" rx="1" />
      <rect x="14" y="9" width="6" height="12" rx="1" />
      <path d="M7 7h1M11 7h1M7 11h1M11 11h1M7 15h1M11 15h1" strokeLinecap="round" />
    </>
  ),
  "clipboard-check": (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.5h6v1" strokeLinejoin="round" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-4.1 3.4-7.5 7.5-7.5s7.5 3.4 7.5 7.5" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
        strokeLinecap="round"
      />
    </>
  ),
  "user-plus": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" strokeLinecap="round" />
      <path d="M18 8v5M15.5 10.5h5" strokeLinecap="round" />
    </>
  ),
  heart: (
    <path
      d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.3 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z"
      strokeLinejoin="round"
    />
  ),
  "sign-out": (
    <>
      <path d="M9 21H5a1 1 0 01-1-1V4a1 1 0 011-1h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function Icon({
  name,
  className,
  strokeWidth = 1.8,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
