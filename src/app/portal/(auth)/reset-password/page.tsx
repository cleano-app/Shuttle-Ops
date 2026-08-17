import { getLocale } from "@/lib/i18n/getLocale";
import { PortalResetPasswordForm } from "@/components/portal/PortalResetPasswordForm";

export default async function PortalResetPasswordPage() {
  const locale = await getLocale();
  return <PortalResetPasswordForm locale={locale} />;
}
