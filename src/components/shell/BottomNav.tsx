"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { activeHref, type NavItem } from "./nav";

const HIDE_AT = {
  md: "md:hidden",
  never: "",
} as const;

/**
 * The phone bottom tab bar (Cleano Ops's ManagerNavBar / WorkerNavBar):
 * fixed to the bottom, 64px plus the home-indicator inset, a 2px teal
 * indicator above the active tab and a heavier icon stroke. The layout
 * reserves the space under content with `pb-tabbar`.
 */
export function BottomNav({ items, hideAt = "md" }: { items: NavItem[]; hideAt?: keyof typeof HIDE_AT }) {
  const pathname = usePathname();
  const current = activeHref(
    pathname,
    items.map((i) => i.href)
  );

  return (
    <nav
      aria-label="Primary"
      className={`fixed inset-x-0 bottom-0 z-40 flex min-h-[64px] items-stretch justify-around border-t border-hairline bg-white pb-[env(safe-area-inset-bottom)] shadow-bar ${HIDE_AT[hideAt]}`}
    >
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-1 touch-manipulation flex-col items-center justify-center gap-1 py-2.5 ${
              active ? "text-teal" : "text-slate-500"
            }`}
          >
            {active && <span className="absolute top-0 h-[2px] w-8 rounded-full bg-teal" aria-hidden="true" />}
            <Icon name={item.icon} strokeWidth={active ? 2.25 : 2} className="h-[22px] w-[22px]" />
            {!!item.badgeCount && item.badgeCount > 0 && (
              <span className="absolute end-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber px-1 text-[10px] font-semibold text-white">
                {item.badgeCount}
              </span>
            )}
            <span className={`text-[10px] ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
