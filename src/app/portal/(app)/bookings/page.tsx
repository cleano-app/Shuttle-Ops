import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { listMyBookings, requestCancellation } from "@/app/actions/portalBookings";

export default async function PortalBookingsPage() {
  const locale = await getLocale();
  const t = getTranslator(locale);
  const { bookings } = await listMyBookings();

  async function cancel(formData: FormData) {
    "use server";
    const bookingId = String(formData.get("booking_id") ?? "");
    const reasonText = String(formData.get("reason_text") ?? "");
    if (!bookingId || !reasonText.trim()) return;
    await requestCancellation({ bookingId, reasonText });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">{t("nav_bookings")}</h1>

      {bookings.length === 0 && <p className="text-slate-500">{t("bookings_none")}</p>}

      <ul className="space-y-3">
        {bookings.map((b) => (
          <li key={b.booking_passenger_id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-slate-900">
              {b.route_name} · {b.direction}
            </p>
            <p className="text-sm text-slate-600">
              {new Date(b.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <p className="text-sm text-slate-500">
              {t("bookings_reference")}: {b.booking_reference} · {t("bookings_status")}: {b.passenger_status}
            </p>
            <p className="text-sm text-slate-500">
              {b.currency === "GBP" ? "£" : "€"}
              {b.contribution} · {b.deposit_status}
            </p>

            {!["cancelled", "expired", "no_show", "travelled"].includes(b.passenger_status) && (
              <form action={cancel} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="booking_id" value={b.booking_id} />
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-slate-600">{t("bookings_cancel_reason")}</label>
                  <input
                    name="reason_text"
                    required
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  {t("bookings_request_cancel")}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
