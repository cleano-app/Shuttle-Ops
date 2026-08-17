import { getLocale } from "@/lib/i18n/getLocale";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";

export default async function PortalLoginPage() {
  const locale = await getLocale();
  return <PortalLoginForm locale={locale} />;
}
