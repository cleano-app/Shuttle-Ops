import { createClient } from "@/lib/supabase/server";
import { createParcelBooking, cancelParcel } from "@/app/actions/parcels";
import type { Currency, ParcelSizeCategory } from "@/types/database";

const SIZE_CATEGORIES: ParcelSizeCategory[] = ["small", "medium", "large", "oversize"];

export default async function ParcelsPage({
  searchParams,
}: {
  searchParams: Promise<{ departure?: string }>;
}) {
  const { departure: departureId } = await searchParams;
  const supabase = await createClient();

  const { data: departures } = await supabase
    .from("departures")
    .select("id, direction, depart_at, routes(name)")
    .in("status", ["draft", "published", "boarding"])
    .order("depart_at", { ascending: true });

  const selectedDepartureId = departureId ?? departures?.[0]?.id;

  const { data: parcels } = selectedDepartureId
    ? await supabase
        .from("parcels")
        .select("*")
        .eq("departure_id", selectedDepartureId)
        .order("created_at", { ascending: false })
    : { data: [] };

  async function bookParcel(formData: FormData) {
    "use server";
    const departureId = String(formData.get("departure_id") ?? "");
    if (!departureId) return;
    await createParcelBooking({
      departureId,
      senderName: String(formData.get("sender_name") ?? ""),
      senderPhone: String(formData.get("sender_phone") ?? "") || null,
      recipientName: String(formData.get("recipient_name") ?? ""),
      recipientPhone: String(formData.get("recipient_phone") ?? "") || null,
      sizeCategory: String(formData.get("size_category") ?? "small") as ParcelSizeCategory,
      description: String(formData.get("description") ?? "") || null,
      prohibitedItemsDeclared: formData.get("prohibited_items_declared") === "on",
      currency: String(formData.get("currency") ?? "GBP") as Currency,
    });
  }

  async function cancel(formData: FormData) {
    "use server";
    await cancelParcel(String(formData.get("parcel_id")));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Parcels</h1>
        <p className="text-sm text-slate-500">
          Parcels share hold capacity with passenger luggage — a booking is checked against the
          same departure hold limit.
        </p>
      </div>

      <form method="get" className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Departure</label>
          <select
            name="departure"
            defaultValue={selectedDepartureId}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {(departures ?? []).map((d) => {
              const routeName = (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
              return (
                <option key={d.id} value={d.id}>
                  {routeName} · {d.direction} ·{" "}
                  {new Date(d.depart_at).toLocaleDateString("en-GB")}
                </option>
              );
            })}
          </select>
        </div>
        <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Switch
        </button>
      </form>

      {selectedDepartureId && (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-medium text-slate-900">Book a parcel</h2>
            <form action={bookParcel} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input type="hidden" name="departure_id" value={selectedDepartureId} />
              <input name="sender_name" placeholder="Sender name" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input name="sender_phone" placeholder="Sender phone" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input name="recipient_name" placeholder="Recipient name" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input name="recipient_phone" placeholder="Recipient phone" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <select name="size_category" className="rounded border border-slate-300 px-2 py-2 text-sm">
                {SIZE_CATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select name="currency" className="rounded border border-slate-300 px-2 py-2 text-sm">
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
              </select>
              <input
                name="description"
                placeholder="Description"
                className="sm:col-span-2 rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="prohibited_items_declared" required />
                Sender has declared no prohibited items are included (required)
              </label>
              <button
                type="submit"
                className="sm:col-span-2 rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white"
              >
                Book parcel
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            {(!parcels || parcels.length === 0) && <p className="p-6 text-sm text-slate-500">No parcels booked yet.</p>}
            <ul className="divide-y divide-slate-200">
              {(parcels ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-slate-900">
                      {p.reference} — {p.sender_name} → {p.recipient_name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {p.size_category} · {p.units_consumed} unit(s) · {p.status} ·{" "}
                      {p.currency === "GBP" ? "£" : "€"}
                      {p.price}
                    </p>
                  </div>
                  {p.status !== "cancelled" && p.status !== "delivered" && (
                    <form action={cancel}>
                      <input type="hidden" name="parcel_id" value={p.id} />
                      <button type="submit" className="text-sm text-red-600 underline">
                        Cancel
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
