import { createClient } from "@/lib/supabase/server";
import { createVehicle, setVehicleStatus } from "@/app/actions/vehicles";
import type { VehicleStatus } from "@/types/database";

const STATUS_OPTIONS: VehicleStatus[] = [
  "available",
  "assigned",
  "maintenance",
  "defect",
  "accident",
  "unavailable",
];

export default async function VehiclesPage() {
  const supabase = await createClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("*")
    .order("registration");

  async function addVehicle(formData: FormData) {
    "use server";
    const registration = String(formData.get("registration") ?? "").trim();
    const seatCapacity = Number(formData.get("seat_capacity") ?? 0);
    if (!registration || !seatCapacity) return;
    await createVehicle({
      registration,
      make_model: String(formData.get("make_model") ?? "") || null,
      seat_capacity: seatCapacity,
      hold_capacity_units: Number(formData.get("hold_capacity_units") ?? 0),
      wheelchair_capacity: Number(formData.get("wheelchair_capacity") ?? 0),
    });
  }

  async function changeStatus(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const status = String(formData.get("status")) as VehicleStatus;
    await setVehicleStatus(id, status);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Vehicles</h1>

      <form
        action={addVehicle}
        className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Registration</label>
          <input name="registration" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Make / model</label>
          <input name="make_model" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Seats</label>
          <input name="seat_capacity" type="number" min={0} required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
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
            Add vehicle
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {(vehicles ?? []).map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-slate-900">
                  {v.registration} {v.make_model ? `· ${v.make_model}` : ""}
                </p>
                <p className="text-sm text-slate-500">
                  {v.seat_capacity} seats · {v.hold_capacity_units} hold units ·{" "}
                  {v.wheelchair_capacity} wheelchair
                </p>
              </div>
              <form action={changeStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={v.id} />
                <select
                  name="status"
                  defaultValue={v.status}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Update
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
