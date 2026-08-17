import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/auth/portalSession";
import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { portalLogout } from "@/app/actions/portalAuth";
import { LanguageSwitcher } from "@/components/portal/LanguageSwitcher";

export default async function ReferrerLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  if (session.kind !== "organization") redirect("/portal/dashboard");

  const locale = await getLocale();
  const t = getTranslator(locale);

  const nav = [
    { href: "/portal/referrer/dashboard", key: "nav_dashboard" as const },
    ...(session.orgType === "referrer" ? [{ href: "/portal/referrer/refer", key: "nav_refer" as const }] : []),
    ...(session.orgType === "sponsor" ? [{ href: "/portal/referrer/sponsored", key: "nav_sponsored" as const }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <Link href="/portal/referrer/dashboard" className="text-lg font-semibold text-slate-900">
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
          {nav.map((item) => (
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
