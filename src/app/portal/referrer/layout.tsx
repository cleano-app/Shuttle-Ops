import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth/portalSession";
import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { portalLogout } from "@/app/actions/portalAuth";
import { LanguageSwitcher } from "@/components/portal/LanguageSwitcher";
import { PortalShell } from "@/components/shell/PortalShell";
import type { NavItem } from "@/components/shell/nav";

export default async function ReferrerLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  if (session.kind !== "organization") redirect("/portal/dashboard");

  const locale = await getLocale();
  const t = getTranslator(locale);

  const items: NavItem[] = [
    { href: "/portal/referrer/dashboard", label: t("nav_dashboard"), icon: "home" },
    ...(session.orgType === "referrer"
      ? [{ href: "/portal/referrer/refer", label: t("nav_refer"), icon: "user-plus" as const }]
      : []),
    ...(session.orgType === "sponsor"
      ? [{ href: "/portal/referrer/sponsored", label: t("nav_sponsored"), icon: "heart" as const }]
      : []),
  ];

  // lang/dir are set by the parent portal/layout.tsx wrapper.
  return (
    <PortalShell
      homeHref="/portal/referrer/dashboard"
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
