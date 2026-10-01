"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "./icons";
import { Logo } from "./Logo";
import { SignOutButton } from "./SignOutButton";
import { activeHref, allItems, type NavGroup } from "./nav";

/**
 * The phone ☰ menu (Cleano Ops's HamburgerMenu): a bottom sheet listing
 * EVERY destination - the bottom-bar items too, so the sheet is complete
 * on its own - in grouped blocks, active row in teal with a 3px edge bar,
 * and a red Sign out row at the foot.
 */
export function HamburgerMenu({
  groups,
  signOutAction,
  signOutLabel,
  signOutConfirm,
  account,
  extra,
  brandName,
  menuLabel = "Menu",
  closeLabel,
}: {
  groups: NavGroup[];
  signOutAction: () => void | Promise<void>;
  signOutLabel?: string;
  signOutConfirm?: string;
  /** Who is signed in, shown above the sign-out row. */
  account?: { name: string; detail?: string };
  /** Anything else the sheet should carry (e.g. a language picker). */
  extra?: React.ReactNode;
  brandName?: string;
  menuLabel?: string;
  closeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = activeHref(
    pathname,
    allItems(groups).map((i) => i.href)
  );

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={menuLabel}
        aria-expanded={open}
        className="touch-manipulation rounded-lg p-2 text-navy transition hover:bg-page active:scale-95"
      >
        <svg width="24" height="24" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
        </svg>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} closeLabel={closeLabel} title={<Logo name={brandName} />}>
        <div className="-mx-4">
          {groups.map((group, i) => (
            <div key={i} className={i > 0 ? "border-t border-hairline" : ""}>
              {group.heading && (
                <p className="px-5 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                  {group.heading}
                </p>
              )}
              {group.items.map((item) => {
                const active = item.href === current;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex min-h-[54px] items-center gap-3.5 px-5 text-[16px] font-medium transition-colors active:bg-press ${
                      active ? "bg-teal/5 text-teal" : "text-navy"
                    }`}
                  >
                    {active && <span className="absolute inset-y-0 start-0 w-[3px] bg-teal" aria-hidden="true" />}
                    <Icon name={item.icon} className={`h-5 w-5 shrink-0 ${active ? "text-teal" : "text-muted"}`} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {!!item.badgeCount && item.badgeCount > 0 && (
                      <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-teal px-1 text-[11px] font-semibold text-white">
                        {item.badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
          {extra && <div className="border-t border-hairline px-5 py-4">{extra}</div>}
          <div className="border-t border-hairline">
            {account && (
              <div className="px-5 pt-4">
                <p className="truncate text-[14px] font-semibold text-navy">{account.name}</p>
                {account.detail && <p className="truncate text-[12px] text-muted">{account.detail}</p>}
              </div>
            )}
            <SignOutButton action={signOutAction} label={signOutLabel} confirmMessage={signOutConfirm} />
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
