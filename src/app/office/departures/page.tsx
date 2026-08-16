import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createDeparture } from "@/app/actions/departures";
import type { DepartureDirection } from "@/types/database";

export default async function DeparturesPage() {
  const supabase = await createClient();
  const [{ data: departures }, { data: routes }] = await Promise.all([
    supabase
      .from("departures")
      .select("id, direction, depart_at, status, seats_capacity, seats_released, routes(name)")
      .order("depart_at", { ascending: false })
      .limit(30),
    supabase.from("routes").select("id, name").eq("active", true).order("name"),
  ]);

  async function addDeparture(formData: FormData) {
    "use server";
    const routeId = String(formData.get("route_id") ?? "");
    const departAt = String(formData.get("depart_at") ?? "");
    const seatsCapacity = Number(formData.get("seats_capacity") ?? 0);
    if (!routeId || !departAt || !seatsCapacity) return;
    await createDeparture({
      route_id: routeId,
      direction: String(formData.get("direction") ?? "outbound") as DepartureDirection,
      depart_at: new Date(departAt).toISOString(),
      seats_capacity: seatsCapacity,
      hold_capacity_units: Number(formData.get("hold_capacity_units") ?? 0),
      wheelchair_capacity: Number(formData.get("wheelchair_capacity") ?? 0),
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Departures</h1>

      <form
        action={addDeparture}
        className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
      >
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Route</label>
          <select name="route_id" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            {(routes ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Direction</label>
          <select name="direction" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="outbound">Outbound</option>
            <option value="return">Return</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Depart at</label>
          <input name="depart_at" type="datetime-local" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Seats</label>
          <input name="seats_capacity" type="number" min={0} required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Hold units</label>
          <input name="hold_capacity_units" type="number" min={0} defaultValue={0} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Wheelchair spaces</label>
          <input name="wheelchair_capacity" type="number" min={0} defaultValue={0} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
            Create departure
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {(departures ?? []).map((d) => {
            const routeName = (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
            return (
              <li key={d.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-slate-900">
                    {routeName} · {d.direction}
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Date(d.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                    {d.status} · {d.seats_released}/{d.seats_capacity} released
                  </p>
                </div>
                <Link
                  href={`/office/departures/${d.id}`}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
