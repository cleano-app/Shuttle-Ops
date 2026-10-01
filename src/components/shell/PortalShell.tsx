import Link from "next/link";
import { LogoMark } from "./Logo";
import { AppBarTitle } from "./AppBarTitle";
import { HamburgerMenu } from "./HamburgerMenu";
import { Sidebar } from "./Sidebar";
import type { NavItem } from "./nav";

/**
 * Passenger / referrer portal chrome, after Cleano Ops's customer portal:
 * below lg a 56px app bar (logo, page title, language, ☰ sheet); lg+ a
 * left sidebar and a 1000px content column. No bottom tab bar - portal
 * users visit occasionally, they don't live in it. Uses logical sides
 * throughout, so the whole shell mirrors under the portal's dir="rtl".
 */
export function PortalShell({
  homeHref,
  brandName,
  items,
  signOutAction,
  signOutLabel,
  languageSwitcher,
  children,
}: {
  homeHref: string;
  brandName: string;
  items: NavItem[];
  signOutAction: () => void | Promise<void>;
  signOutLabel: string;
  languageSwitcher: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-page lg:flex">
      <Sidebar
        homeHref={homeHref}
        brandName={brandName}
        groups={[{ items }]}
        signOutAction={signOutAction}
        signOutLabel={signOutLabel}
        extra={languageSwitcher}
        showAt="lg"
      />
      <div className="min-w-0 flex-1">
        <header className="border-b border-hairline bg-white lg:hidden">
          <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
            <Link href={homeHref} className="flex min-w-0 items-center gap-2">
              <LogoMark />
              <AppBarTitle items={items} fallback={brandName} />
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {languageSwitcher}
              <HamburgerMenu
                groups={[{ items }]}
                signOutAction={signOutAction}
                signOutLabel={signOutLabel}
                brandName={brandName}
              />
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-2xl p-4 pb-8 focus:outline-none lg:max-w-[1000px] lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
