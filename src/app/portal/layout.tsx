import { getLocale } from "@/lib/i18n/getLocale";
import { dirFor } from "@/lib/i18n/locales";

// Wraps EVERY /portal page, including the public auth forms — so a
// visitor's chosen language/direction applies before they've even signed
// in. Scoped as a `dir`/`lang` div rather than the document <html> (that's
// shared with office/driver in the root layout and must stay English/LTR
// always) — a common, working pattern for a single app with one RTL
// section rather than a fully separate document per locale.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <div lang={locale} dir={dirFor(locale)} className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
