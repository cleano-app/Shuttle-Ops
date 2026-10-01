import type { IconName } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Small count pill, only where a real count exists. */
  badgeCount?: number;
}

export interface NavGroup {
  /** Omit for an unheaded block. */
  heading?: string;
  items: NavItem[];
}

/**
 * The one active-link rule for every piece of shell chrome: the item whose
 * href is the LONGEST prefix of the current path wins. So with /driver,
 * /driver/check and /driver/me as tabs, /driver/<departure id> lights
 * "Today" while /driver/check lights "Check" - not both.
 */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}

/** Every href across a set of groups (plus any extra items). */
export function allItems(groups: NavGroup[], extra: NavItem[] = []): NavItem[] {
  return [...extra, ...groups.flatMap((g) => g.items)];
}
