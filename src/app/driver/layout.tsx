import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { LogoMark } from "@/components/shell/Logo";
import { AppBarTitle } from "@/components/shell/AppBarTitle";
import { HamburgerMenu } from "@/components/shell/HamburgerMenu";
import { BottomNav } from "@/components/shell/BottomNav";
import type { NavItem } from "@/components/shell/nav";

// Phone-first, like Cleano Ops's worker shell: app bar + ☰ at the top, a
// fixed bottom tab bar on every width. /driver/<departure id> (the route
// screen) lights "Today" - see activeHref's longest-prefix rule.
const TABS: NavItem[] = [
  { href: "/driver", label: "Today", icon: "home" },
  { href: "/driver/check", label: "Check", icon: "clipboard-check" },
  { href: "/driver/me", label: "Me", icon: "user" },
];

const MENU_ITEMS: NavItem[] = [
  { href: "/driver", label: "Today", icon: "home" },
  { href: "/driver/check", label: "Vehicle check", icon: "clipboard-check" },
  { href: "/driver/me", label: "Me - pay & expenses", icon: "user" },
];

const TITLE_ITEMS = [
  { href: "/driver", label: "Today" },
  { href: "/driver/check", label: "Vehicle check" },
  { href: "/driver/me", label: "Me" },
];

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  // Same checks every driver page already makes (getSession is cached per
  // request, so this costs nothing extra); here so the shell has a name.
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "driver") redirect("/office/dashboard");

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-hairline bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <LogoMark />
            <AppBarTitle items={TITLE_ITEMS} fallback="Shuttle Ops" />
          </div>
          <HamburgerMenu
            groups={[{ items: MENU_ITEMS }]}
            signOutAction={logout}
            signOutConfirm="Sign out?"
            account={{ name: session.displayName, detail: "Driver" }}
          />
        </div>
      </header>
      {/* No padding here: each driver screen pads itself (the route screen
          runs edge to edge). pb-tabbar keeps the last row clear of the bar. */}
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl pb-tabbar focus:outline-none">
        {children}
      </main>
      <BottomNav items={TABS} hideAt="never" />
    </div>
  );
}
