import { getLocale } from "@/lib/i18n/getLocale";
import { PortalForgotPasswordForm } from "@/components/portal/PortalForgotPasswordForm";

export default async function PortalForgotPasswordPage() {
  const locale = await getLocale();
  return <PortalForgotPasswordForm locale={locale} />;
}
