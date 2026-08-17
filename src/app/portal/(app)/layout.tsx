import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/auth/portalSession";
import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { portalLogout } from "@/app/actions/portalAuth";
import { LanguageSwitcher } from "@/components/portal/LanguageSwitcher";

const NAV = [
  { href: "/portal/dashboard", key: "nav_dashboard" as const },
  { href: "/portal/book", key: "nav_book" as const },
  { href: "/portal/bookings", key: "nav_bookings" as const },
  { href: "/portal/addresses", key: "nav_addresses" as const },
  { href: "/portal/parcels", key: "nav_parcels" as const },
  { href: "/portal/profile", key: "nav_profile" as const },
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <Link href="/portal/dashboard" className="text-lg font-semibold text-slate-900">
            {t("app_name")}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher current={locale} />
            <form action={portalLogout}>
              <button
                type="submit"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t("nav_sign_out")}
              </button>
            </form>
          </div>
        </div>
        <nav className="flex items-center gap-2 overflow-x-auto px-4 py-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl p-4">{children}</main>
    </div>
  );
}
