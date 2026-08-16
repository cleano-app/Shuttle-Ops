import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { transitionDepartureStatus, updateReleasedSeats } from "@/app/actions/departures";
import { assignVehicleToDeparture } from "@/app/actions/vehicles";
import type { DepartureStatus } from "@/types/database";

const NEXT_STATUS: Partial<Record<DepartureStatus, DepartureStatus>> = {
  draft: "published",
  published: "boarding",
  boarding: "departed",
  departed: "completed",
};

export default async function DepartureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: departure }, { data: summary }, { data: vehicles }, { data: assigned }] =
    await Promise.all([
      supabase.from("departures").select("*, routes(name)").eq("id", id).single(),
      supabase.from("departure_capacity_summary").select("*").eq("departure_id", id).maybeSingle(),
      supabase.from("vehicles").select("id, registration").eq("active", true).order("registration"),
      supabase
        .from("departure_vehicles")
        .select("id, vehicle_id, seats_capacity, hold_capacity_units, wheelchair_capacity, vehicles(registration)")
        .eq("departure_id", id),
    ]);

  if (!departure) notFound();

  const routeName = (departure as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
  const nextStatus = NEXT_STATUS[departure.status];

  async function advanceStatus() {
    "use server";
    if (!nextStatus) return;
    await transitionDepartureStatus(id, departure!.status, nextStatus);
  }

  async function cancelDeparture() {
    "use server";
    await transitionDepartureStatus(id, departure!.status, "cancelled");
  }

  async function releaseSeats(formData: FormData) {
    "use server";
    const seats = Number(formData.get("seats_released") ?? 0);
    await updateReleasedSeats(id, seats);
  }

  async function addVehicle(formData: FormData) {
    "use server";
    const vehicleId = String(formData.get("vehicle_id") ?? "");
    if (!vehicleId) return;
    await assignVehicleToDeparture({ departure_id: id, vehicle_id: vehicleId });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/office/departures" className="text-sm text-slate-500 hover:underline">
          ← Departures
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          {routeName} · {departure.direction}
        </h1>
        <p className="text-sm text-slate-500">
          {new Date(departure.depart_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })} ·
          status: <span className="font-medium">{departure.status}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {nextStatus && (
          <form action={advanceStatus}>
            <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
              Advance to {nextStatus}
            </button>
          </form>
        )}
        {departure.status !== "cancelled" && departure.status !== "completed" && (
          <form action={cancelDeparture}>
            <button type="submit" className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              Cancel departure
            </button>
          </form>
        )}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Capacity</h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-slate-500">Seats</p>
            <p className="text-lg font-semibold text-slate-900">
              {summary?.seats_used ?? 0} / {departure.seats_released}{" "}
              <span className="text-sm font-normal text-slate-500">of {departure.seats_capacity}</span>
            </p>
          </div>
          <div>
            <p className="text-slate-500">Hold</p>
            <p className="text-lg font-semibold text-slate-900">
              {summary?.hold_used ?? 0} / {departure.hold_capacity_units}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Wheelchair</p>
            <p className="text-lg font-semibold text-slate-900">
              {summary?.wheelchair_used ?? 0} / {departure.wheelchair_capacity}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Crossing</p>
            <p className="text-lg font-semibold text-slate-900">
              {summary?.crossing_headcount ?? 0}
              {departure.crossing_passenger_limit ? ` / ${departure.crossing_passenger_limit}` : ""}
            </p>
          </div>
        </div>
        {summary && (
          <p className="mt-3 text-sm text-slate-600">
            {summary.men} men · {summary.women} women · {summary.boys} boys · {summary.girls} girls ·{" "}
            {summary.infants} infants
          </p>
        )}
        <form action={releaseSeats} className="mt-4 flex items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Release seats</label>
            <input
              name="seats_released"
              type="number"
              min={0}
              max={departure.seats_capacity}
              defaultValue={departure.seats_released}
              className="w-28 rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Update
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Vehicles assigned</h2>
        <ul className="mb-4 text-sm text-slate-700">
          {(assigned ?? []).length === 0 && (
            <li className="text-slate-500">
              None — single-vehicle departure, no assignment needed.
            </li>
          )}
          {(assigned ?? []).map((a) => (
            <li key={a.id}>
              {(a as unknown as { vehicles?: { registration?: string } }).vehicles?.registration} —{" "}
              {a.seats_capacity} seats, {a.hold_capacity_units} hold units
            </li>
          ))}
        </ul>
        <form action={addVehicle} className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Add vehicle</label>
            <select name="vehicle_id" className="rounded border border-slate-300 px-3 py-2 text-sm">
              {(vehicles ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Assign
          </button>
        </form>
      </section>
    </div>
  );
}
