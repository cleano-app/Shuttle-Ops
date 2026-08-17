import Link from "next/link";
import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { listPublicDepartures } from "@/app/actions/portalDepartures";
import { getMyProfile } from "@/app/actions/portalBookings";

export default async function PortalDashboardPage() {
  const locale = await getLocale();
  const t = getTranslator(locale);
  const [{ departures }, { profile }] = await Promise.all([listPublicDepartures(), getMyProfile()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("dashboard_welcome")}
          {profile ? `, ${profile.full_name}` : ""}
        </h1>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">{t("dashboard_upcoming")}</h2>
        <ul className="space-y-2">
          {departures.map((d) => (
            <li key={d.departure_id} className="rounded-lg border border-slate-200 p-3">
              <p className="font-semibold text-slate-900">
                {d.route_name} · {d.direction}
              </p>
              <p className="text-sm text-slate-600">
                {new Date(d.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="text-sm text-slate-500">
                {d.seats_available} {t("book_seats_available")}
              </p>
              <Link
                href={`/portal/book?departure=${d.departure_id}`}
                className="mt-2 inline-block rounded bg-brand-dark px-3 py-1.5 text-sm font-medium text-white"
              >
                {t("book_submit")}
              </Link>
            </li>
          ))}
          {departures.length === 0 && <li className="text-slate-500">{t("bookings_none")}</li>}
        </ul>
      </section>
    </div>
  );
}
