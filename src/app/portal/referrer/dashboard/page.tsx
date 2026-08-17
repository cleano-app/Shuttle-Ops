import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { getMyOrganization, listMyReferredPassengers, listMySponsoredBookings } from "@/app/actions/referrer";

export default async function ReferrerDashboardPage() {
  const locale = await getLocale();
  const t = getTranslator(locale);
  const { organization } = await getMyOrganization();

  const isReferrer = organization?.org_type === "referrer";
  const [{ passengers }, { bookings }] = await Promise.all([
    isReferrer ? listMyReferredPassengers() : Promise.resolve({ passengers: [] }),
    !isReferrer ? listMySponsoredBookings() : Promise.resolve({ bookings: [] }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        {t("referrer_dashboard_title")}
        {organization ? ` — ${organization.name}` : ""}
      </h1>

      {isReferrer && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-medium text-slate-900">{t("nav_referred")}</h2>
          <ul className="space-y-2 text-sm">
            {passengers.map((p) => (
              <li key={p.passenger_id} className="rounded border border-slate-200 p-2">
                {p.full_name} · {p.category} · {new Date(p.created_at).toLocaleDateString("en-GB")}
              </li>
            ))}
            {passengers.length === 0 && <li className="text-slate-500">{t("referrer_no_referred")}</li>}
          </ul>
        </section>
      )}

      {!isReferrer && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-medium text-slate-900">{t("nav_sponsored")}</h2>
          <ul className="space-y-2 text-sm">
            {bookings.map((b) => (
              <li key={b.booking_passenger_id} className="rounded border border-slate-200 p-2">
                {b.route_name} · {b.direction} · {new Date(b.depart_at).toLocaleDateString("en-GB")} ·{" "}
                {b.currency === "GBP" ? "£" : "€"}
                {b.sponsored}
              </li>
            ))}
            {bookings.length === 0 && <li className="text-slate-500">{t("referrer_no_sponsored")}</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
