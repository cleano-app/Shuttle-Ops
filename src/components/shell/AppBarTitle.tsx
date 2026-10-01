"use client";

import { usePathname } from "next/navigation";
import { activeHref } from "./nav";

/**
 * The phone app bar's "where am I" line (Cleano Ops's AppBarTitle): the
 * label of the nav item the current path falls under, or `fallback`.
 */
export function AppBarTitle({
  items,
  fallback,
}: {
  items: { href: string; label: string }[];
  fallback: string;
}) {
  const pathname = usePathname();
  const href = activeHref(
    pathname,
    items.map((i) => i.href)
  );
  const label = items.find((i) => i.href === href)?.label ?? fallback;
  return <p className="truncate text-[15px] font-semibold text-navy">{label}</p>;
}
