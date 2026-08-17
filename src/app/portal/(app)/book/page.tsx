import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { listPublicDepartures } from "@/app/actions/portalDepartures";
import { BookTripForm } from "@/components/portal/BookTripForm";

export default async function PortalBookPage({
  searchParams,
}: {
  searchParams: Promise<{ departure?: string }>;
}) {
  const { departure } = await searchParams;
  const locale = await getLocale();
  const t = getTranslator(locale);
  const { departures } = await listPublicDepartures();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t("nav_book")}</h1>
      <BookTripForm locale={locale} departures={departures} initialDepartureId={departure} />
    </div>
  );
}
