import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { listMySponsoredBookings } from "@/app/actions/referrer";

export default async function SponsoredBookingsPage() {
  const locale = await getLocale();
  const t = getTranslator(locale);
  const { bookings } = await listMySponsoredBookings();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">{t("referrer_sponsor_title")}</h1>
      <ul className="space-y-2 text-sm">
        {bookings.map((b) => (
          <li key={b.booking_passenger_id} className="rounded border border-slate-200 bg-white p-3">
            {b.route_name} · {b.direction} · {new Date(b.depart_at).toLocaleDateString("en-GB")} ·{" "}
            {b.category} · {b.currency === "GBP" ? "£" : "€"}
            {b.sponsored}
          </li>
        ))}
        {bookings.length === 0 && <li className="text-slate-500">{t("referrer_no_sponsored")}</li>}
      </ul>
    </div>
  );
}
