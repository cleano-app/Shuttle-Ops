import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { LogoMark } from "@/components/shell/Logo";
import { AppBarTitle } from "@/components/shell/AppBarTitle";
import { HamburgerMenu } from "@/components/shell/HamburgerMenu";
import { Sidebar } from "@/components/shell/Sidebar";
import { BottomNav } from "@/components/shell/BottomNav";
import type { NavGroup, NavItem } from "@/components/shell/nav";

// The four most-used destinations: bottom tab bar on a phone, top block
// of the sidebar on desktop (Cleano Ops's primaryNavItems).
const PRIMARY_ITEMS: NavItem[] = [
  { href: "/office/dashboard", label: "Dashboard", icon: "home" },
  { href: "/office/booking-console", label: "Book", icon: "ticket" },
  { href: "/office/departures", label: "Departures", icon: "calendar" },
  { href: "/office/dispatch", label: "Dispatch", icon: "route" },
];

const GROUPS: NavGroup[] = [
  {
    heading: "Operations",
    items: [
      { href: "/office/passengers", label: "Passengers", icon: "users" },
      { href: "/office/parcels", label: "Parcels", icon: "package" },
      { href: "/office/cancellations", label: "Cancellations", icon: "x-circle" },
    ],
  },
  {
    heading: "Fleet",
    items: [
      { href: "/office/vehicles", label: "Vehicles", icon: "bus" },
      { href: "/office/fleet", label: "Fleet", icon: "wrench" },
    ],
  },
  {
    heading: "Money",
    items: [
      { href: "/office/driver-pay", label: "Driver Pay", icon: "wallet" },
      { href: "/office/reports", label: "Reports", icon: "bar-chart" },
      { href: "/office/accounting", label: "Accounting", icon: "receipt" },
      { href: "/office/tariffs", label: "Tariffs", icon: "tag" },
    ],
  },
  {
    heading: "Setup",
    items: [
      { href: "/office/areas", label: "Areas", icon: "map-pin" },
      { href: "/office/organizations", label: "Organizations", icon: "building" },
      { href: "/office/team", label: "Team", icon: "user" },
    ],
  },
];

// The phone ☰ sheet lists the bar items too, so it is a complete list of
// destinations on its own (Cleano: "all items in the bottom bar should
// also be in the burger"). The bar's short "Book" reads as the full name.
const MOBILE_GROUPS: NavGroup[] = [
  {
    items: PRIMARY_ITEMS.map((i) =>
      i.href === "/office/booking-console" ? { ...i, label: "Booking Console" } : i
    ),
  },
  ...GROUPS,
];

const TITLE_ITEMS = [...MOBILE_GROUPS.flatMap((g) => g.items)];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  office: "Office",
  dispatcher: "Dispatcher",
  driver: "Driver",
};

export default async function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "driver") redirect("/driver");

  const account = { name: session.displayName, detail: ROLE_LABEL[session.role] ?? session.role };

  return (
    // Cleano Ops's manager shell. Below md: phone app bar (logo + page
    // title + ☰), fixed bottom tab bar, phone-width column. md+: sticky
    // left sidebar and a wide content area. No in-between band.
    <div className="min-h-screen bg-page md:flex">
      <Sidebar
        homeHref="/office/dashboard"
        primaryItems={PRIMARY_ITEMS}
        groups={GROUPS}
        signOutAction={logout}
        signOutConfirm="Sign out?"
        account={account}
      />
      <div className="min-w-0 flex-1">
        <header className="border-b border-hairline bg-white md:hidden">
          <div className="mx-auto flex h-14 max-w-[560px] items-center justify-between gap-3 px-4">
            <Link href="/office/dashboard" className="flex min-w-0 items-center gap-2">
              <LogoMark />
              <AppBarTitle items={TITLE_ITEMS} fallback="Shuttle Ops" />
            </Link>
            <HamburgerMenu
              groups={MOBILE_GROUPS}
              signOutAction={logout}
              signOutConfirm="Sign out?"
              account={account}
            />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          // Phone: Cleano's deliberate phone-width column, with room under
          // it for the fixed tab bar. md+: wide (1400px cap) desktop area.
          className="mx-auto max-w-[560px] p-4 pb-tabbar focus:outline-none md:max-w-[1400px] md:p-8 md:pb-8"
        >
          {children}
        </main>
      </div>
      <BottomNav items={PRIMARY_ITEMS} />
    </div>
  );
}
