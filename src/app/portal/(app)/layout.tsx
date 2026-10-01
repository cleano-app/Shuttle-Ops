import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth/portalSession";
import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { portalLogout } from "@/app/actions/portalAuth";
import { LanguageSwitcher } from "@/components/portal/LanguageSwitcher";
import { PortalShell } from "@/components/shell/PortalShell";
import type { NavItem } from "@/components/shell/nav";

const NAV = [
  { href: "/portal/dashboard", key: "nav_dashboard" as const, icon: "home" as const },
  { href: "/portal/book", key: "nav_book" as const, icon: "ticket" as const },
  { href: "/portal/bookings", key: "nav_bookings" as const, icon: "calendar" as const },
  { href: "/portal/addresses", key: "nav_addresses" as const, icon: "map-pin" as const },
  { href: "/portal/parcels", key: "nav_parcels" as const, icon: "package" as const },
  { href: "/portal/profile", key: "nav_profile" as const, icon: "user" as const },
];

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  // An org-linked user landing on a passenger-only URL gets sent to their
  // own dashboard rather than a 404/blank page — same "layout redirects
  // by role" convention as OfficeLayout redirecting drivers away.
  if (session.kind !== "passenger") redirect("/portal/referrer/dashboard");

  const locale = await getLocale();
  const t = getTranslator(locale);

  const items: NavItem[] = NAV.map((item) => ({ href: item.href, label: t(item.key), icon: item.icon }));

  // lang/dir are set by the parent portal/layout.tsx wrapper.
  return (
    <PortalShell
      homeHref="/portal/dashboard"
      brandName={t("app_name")}
      items={items}
      signOutAction={portalLogout}
      signOutLabel={t("nav_sign_out")}
      languageSwitcher={<LanguageSwitcher current={locale} />}
    >
      {children}
    </PortalShell>
  );
}
