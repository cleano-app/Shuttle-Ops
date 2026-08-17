import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { listMyParcels } from "@/app/actions/portalParcels";
import { listPublicDepartures } from "@/app/actions/portalDepartures";
import { BookParcelForm } from "@/components/portal/BookParcelForm";

export default async function PortalParcelsPage() {
  const locale = await getLocale();
  const t = getTranslator(locale);
  const [{ parcels }, { departures }] = await Promise.all([listMyParcels(), listPublicDepartures()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t("nav_parcels")}</h1>

      <BookParcelForm locale={locale} departures={departures} />

      <ul className="space-y-2">
        {parcels.map((p) => (
          <li key={p.parcel_id} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="font-semibold text-slate-900">{p.reference}</p>
            <p className="text-sm text-slate-600">
              {p.route_name} · {p.direction} ·{" "}
              {new Date(p.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <p className="text-sm text-slate-500">
              {p.recipient_name} · {p.size_category} · {p.status}
            </p>
          </li>
        ))}
        {parcels.length === 0 && <li className="text-slate-500">{t("parcels_none")}</li>}
      </ul>
    </div>
  );
}
