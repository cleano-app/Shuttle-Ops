import { getLocale } from "@/lib/i18n/getLocale";
import { PortalSignupForm } from "@/components/portal/PortalSignupForm";

export default async function PortalSignupPage() {
  const locale = await getLocale();
  return <PortalSignupForm locale={locale} />;
}
