import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { transitionDepartureStatus, updateReleasedSeats } from "@/app/actions/departures";
import { assignVehicleToDeparture } from "@/app/actions/vehicles";
import { listCashForDeparture, reconcileAllForDeparture } from "@/app/actions/cash";
import { listWaitlistForDeparture, offerNextWaiting } from "@/app/actions/waitlist";
import { reaccommodateDeparture } from "@/app/actions/disruption";
import type { DepartureStatus, DisruptionType } from "@/types/database";

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

  const [{ data: departure }, { data: summary }, { data: vehicles }, { data: assigned }, { transactions: cash }, { entries: waitlistEntries }, { data: otherDepartures }] =
    await Promise.all([
      supabase.from("departures").select("*, routes(name)").eq("id", id).single(),
      supabase.from("departure_capacity_summary").select("*").eq("departure_id", id).maybeSingle(),
      supabase.from("vehicles").select("id, registration").eq("active", true).order("registration"),
      supabase
        .from("departure_vehicles")
        .select("id, vehicle_id, seats_capacity, hold_capacity_units, wheelchair_capacity, vehicles(registration)")
        .eq("departure_id", id),
      listCashForDeparture(id),
      listWaitlistForDeparture(id),
      supabase
        .from("departures")
        .select("id, direction, depart_at, routes(name)")
        .neq("id", id)
        .in("status", ["draft", "published", "boarding"])
        .order("depart_at", { ascending: true }),
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

  async function reconcileCash() {
    "use server";
    await reconcileAllForDeparture(id);
  }

  async function offerWaitlist() {
    "use server";
    await offerNextWaiting(id);
  }

  async function reaccommodate(formData: FormData) {
    "use server";
    const targetDepartureId = String(formData.get("target_departure_id") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!targetDepartureId || !reason) return;
    await reaccommodateDeparture({
      sourceDepartureId: id,
      targetDepartureId,
      type: String(formData.get("type") ?? "other") as DisruptionType,
      reason,
    });
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

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Cash</h2>
          <Link href={`/office/departures/${id}/reconciliation`} className="text-sm font-medium text-brand-dark underline">
            Full reconciliation report →
          </Link>
        </div>
        <ul className="mb-3 space-y-1 text-sm">
          {(cash ?? []).map((c) => (
            <li key={c.id} className={c.reconciled_at ? "text-slate-600" : "font-medium text-amber-700"}>
              {c.transaction_type} — {c.currency === "GBP" ? "£" : "€"}
              {c.amount} {c.reconciled_at ? "· reconciled" : "· unreconciled"}
            </li>
          ))}
          {(!cash || cash.length === 0) && <li className="text-slate-500">No cash recorded yet.</li>}
        </ul>
        {(cash ?? []).some((c) => !c.reconciled_at) && (
          <form action={reconcileCash}>
            <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Reconcile all
            </button>
          </form>
        )}
        <p className="mt-2 text-xs text-slate-500">Unreconciled cash blocks this departure from reaching completed.</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Waitlist</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {(waitlistEntries ?? []).map((w) => {
            const name = (w as unknown as { passengers?: { full_name?: string } }).passengers?.full_name;
            return (
              <li key={w.id}>
                {name ?? "Passenger"} — {w.seats_wanted} seat(s) — {w.status}
              </li>
            );
          })}
          {(!waitlistEntries || waitlistEntries.length === 0) && <li className="text-slate-500">Nobody waiting.</li>}
        </ul>
        {(waitlistEntries ?? []).some((w) => w.status === "waiting") && (
          <form action={offerWaitlist}>
            <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Offer next who fits
            </button>
          </form>
        )}
      </section>

      {departure.status !== "cancelled" && departure.status !== "completed" && (otherDepartures ?? []).length > 0 && (
        <section className="rounded-lg border border-red-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-slate-900">Disruption — re-accommodate</h2>
          <p className="mb-3 text-sm text-slate-500">
            Moves every passenger on this departure to a target departure, running the full capacity check for
            each. Anyone who doesn&apos;t fit goes onto the target&apos;s waitlist instead of being dropped. This
            departure is then cancelled.
          </p>
          <form action={reaccommodate} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Reason</label>
              <select name="type" className="rounded border border-slate-300 px-2 py-2 text-sm">
                <option value="vehicle_off_road">Vehicle off the road</option>
                <option value="crossing_cancelled">Crossing cancelled</option>
                <option value="driver_unavailable">Driver unavailable</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Move to</label>
              <select name="target_departure_id" className="rounded border border-slate-300 px-2 py-2 text-sm">
                {(otherDepartures ?? []).map((d) => {
                  const rn = (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
                  return (
                    <option key={d.id} value={d.id}>
                      {rn} · {d.direction} · {new Date(d.depart_at).toLocaleDateString("en-GB")}
                    </option>
                  );
                })}
              </select>
            </div>
            <input name="reason" placeholder="Details" required className="min-w-[180px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              Re-accommodate everyone
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
