"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { Logo } from "./Logo";
import { SignOutButton } from "./SignOutButton";
import { activeHref, allItems, type NavGroup, type NavItem } from "./nav";

// Literal class strings so Tailwind sees them (no string-built classes).
const SHOW_AT = {
  md: "hidden md:sticky md:top-0 md:flex md:h-screen",
  lg: "hidden lg:sticky lg:top-0 lg:flex lg:h-screen",
} as const;

/**
 * The desktop sidebar (Cleano Ops's ManagerSidebar): brand at the top, the
 * primary destinations as larger rows, a hairline, then the grouped
 * sections as smaller rows under uppercase headings, and the signed-in
 * user + Sign out pinned to the foot. Sticky, full height, scrolls on its
 * own. Hidden below `showAt`, where the phone app bar + bottom bar take
 * over. Uses logical (start/end) sides so it mirrors under dir="rtl".
 */
export function Sidebar({
  homeHref,
  brandName,
  primaryItems = [],
  groups,
  signOutAction,
  signOutLabel,
  signOutConfirm,
  account,
  extra,
  showAt = "md",
}: {
  homeHref: string;
  brandName?: string;
  primaryItems?: NavItem[];
  groups: NavGroup[];
  signOutAction: () => void | Promise<void>;
  signOutLabel?: string;
  signOutConfirm?: string;
  account?: { name: string; detail?: string };
  extra?: React.ReactNode;
  showAt?: keyof typeof SHOW_AT;
}) {
  const pathname = usePathname();
  const current = activeHref(
    pathname,
    allItems(groups, primaryItems).map((i) => i.href)
  );

  return (
    <div className={`w-[232px] shrink-0 flex-col border-e border-hairline bg-white ${SHOW_AT[showAt]}`}>
      <div className="flex h-full min-h-0 flex-col overflow-y-auto p-3">
        <Link href={homeHref} className="flex items-center gap-2 px-2.5 py-2 pb-4">
          <Logo name={brandName} />
        </Link>

        {primaryItems.length > 0 && (
          <>
            <nav aria-label="Primary" className="space-y-0.5">
              {primaryItems.map((item) => {
                const active = item.href === current;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
                      active ? "bg-teal-bg text-teal" : "text-navy hover:bg-press"
                    }`}
                  >
                    <Icon
                      name={item.icon}
                      strokeWidth={active ? 2.25 : 2}
                      className={`h-[18px] w-[18px] shrink-0 ${active ? "" : "text-muted"}`}
                    />
                    {item.label}
                    {!!item.badgeCount && item.badgeCount > 0 && (
                      <span className="ms-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[10.5px] font-semibold text-white">
                        {item.badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="my-2.5 border-t border-hairline" />
          </>
        )}

        <nav aria-label={primaryItems.length > 0 ? "Sections" : "Primary"}>
          {groups.map((group, i) => (
            <div key={i} className="mb-0.5">
              {group.heading && (
                <p className="px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">
                  {group.heading}
                </p>
              )}
              {group.items.map((item) => {
                const active = item.href === current;
                // Without primary items the groups ARE the main nav, so
                // they get the larger primary row size (Cleano's customer
                // sidebar does the same).
                const big = primaryItems.length === 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 transition-colors ${
                      big ? "py-2 text-[13.5px] font-medium" : "py-[5.6px] text-[13px]"
                    } ${
                      active
                        ? `${big ? "bg-teal-bg" : "bg-teal/5 font-semibold"} text-teal`
                        : `${big ? "text-navy" : "text-subtle"} hover:bg-press`
                    }`}
                  >
                    <Icon
                      name={item.icon}
                      className={`shrink-0 ${big ? "h-[18px] w-[18px]" : "h-4 w-4"} ${active ? "text-teal" : "text-muted"}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {!!item.badgeCount && item.badgeCount > 0 && (
                      <span className="flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-full bg-teal px-1 text-[10.5px] font-semibold text-white">
                        {item.badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-3">
          {extra && <div className="mb-2 px-1">{extra}</div>}
          <div className="border-t border-hairline pt-1.5">
            {account && (
              <div className="px-2.5 py-2">
                <p className="truncate text-[13px] font-semibold text-navy">{account.name}</p>
                {account.detail && <p className="truncate text-[11.5px] text-muted">{account.detail}</p>}
              </div>
            )}
            <SignOutButton
              action={signOutAction}
              label={signOutLabel}
              confirmMessage={signOutConfirm}
              variant="sidebar"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
