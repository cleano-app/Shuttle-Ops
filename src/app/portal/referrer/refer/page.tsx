import { getLocale } from "@/lib/i18n/getLocale";
import { ReferPassengerForm } from "@/components/portal/ReferPassengerForm";

export default async function ReferPage() {
  const locale = await getLocale();
  return <ReferPassengerForm locale={locale} />;
}
