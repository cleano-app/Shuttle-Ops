import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { transitionDepartureStatus, updateDeparture, updateReleasedSeats } from "@/app/actions/departures";
import { expireStaleProvisionalBookings } from "@/app/actions/bookings";
import { assignVehicleToDeparture } from "@/app/actions/vehicles";
import { listCashForDeparture, reconcileAllForDeparture } from "@/app/actions/cash";
import { listWaitlistForDeparture, offerNextWaiting } from "@/app/actions/waitlist";
import { reaccommodateDeparture } from "@/app/actions/disruption";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";
import { DepartureBookings } from "@/components/office/departure/DepartureBookings";
import { formatUk, isoToUkLocal, ukLocalToIso } from "@/lib/time";
import type { DepartureStatus, DisruptionType } from "@/types/database";

const NEXT_STATUS: Partial<Record<DepartureStatus, DepartureStatus>> = {
  draft: "published",
  published: "boarding",
  boarding: "departed",
  departed: "completed",
};

const NEXT_LABEL: Partial<Record<DepartureStatus, string>> = {
  draft: "Publish — open for booking",
  published: "Start boarding",
  boarding: "Mark departed",
  departed: "Mark completed",
};

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "block text-sm font-medium text-slate-700";
const secondaryBtn =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
const card = "rounded-xl border border-slate-200 bg-white p-4";

function numOrNull(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
}

export default async function DepartureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await expireStaleProvisionalBookings(id);
  const supabase = await createClient();

  const [
    { data: departure },
    { data: summary },
    { data: vehicles },
    { data: assigned },
    { transactions: cash },
    { entries: waitlistEntries },
    { data: otherDepartures },
    { data: drivers },
  ] = await Promise.all([
    supabase.from("departures").select("*, routes(name)").eq("id", id).single(),
    supabase.from("departure_capacity_summary").select("*").eq("departure_id", id).maybeSingle(),
    supabase.from("vehicles").select("id, registration, status").eq("active", true).order("registration"),
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
      .gte("depart_at", new Date().toISOString())
      .order("depart_at", { ascending: true }),
    supabase
      .from("driver_assignments")
      .select("id, status, profiles:driver_id(display_name), vehicles(registration)")
      .eq("departure_id", id),
  ]);

  if (!departure) notFound();

  const routeName = (departure as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
  const nextStatus = NEXT_STATUS[departure.status as DepartureStatus];
  const isLive = departure.status !== "cancelled" && departure.status !== "completed";

  async function advanceStatus(): Promise<FormResult> {
    "use server";
    if (!nextStatus) return { error: "Nothing further to do." };
    return transitionDepartureStatus(id, departure!.status, nextStatus);
  }

  async function cancelDeparture(): Promise<FormResult> {
    "use server";
    return transitionDepartureStatus(id, departure!.status, "cancelled");
  }

  async function saveDetails(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const departAt = ukLocalToIso(String(formData.get("depart_at") ?? ""));
    if (!departAt) return { error: "Enter the departure time." };
    const result = await updateDeparture(id, {
      depart_at: departAt,
      arrive_estimate: ukLocalToIso(String(formData.get("arrive_estimate") ?? "")),
      crossing_reference: String(formData.get("crossing_reference") ?? "").trim() || null,
      crossing_passenger_limit: numOrNull(formData.get("crossing_passenger_limit")),
      crossing_checkin_deadline: ukLocalToIso(String(formData.get("crossing_checkin_deadline") ?? "")),
      crossing_cost_gbp: numOrNull(formData.get("crossing_cost_gbp")),
      crossing_cost_eur: numOrNull(formData.get("crossing_cost_eur")),
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    return result.error ? result : { success: true, message: "Saved." };
  }

  async function releaseSeats(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const seats = Number(formData.get("seats_released") ?? 0);
    const result = await updateReleasedSeats(id, seats);
    return result.error ? result : { success: true, message: `${seats} seats released.` };
  }

  async function addVehicle(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const vehicleId = String(formData.get("vehicle_id") ?? "");
    if (!vehicleId) return { error: "Choose a vehicle." };
    return assignVehicleToDeparture({
      departure_id: id,
      vehicle_id: vehicleId,
      override_reason: String(formData.get("override_reason") ?? "").trim() || undefined,
    });
  }

  async function reconcileCash(): Promise<FormResult> {
    "use server";
    return reconcileAllForDeparture(id);
  }

  async function offerWaitlist(): Promise<FormResult> {
    "use server";
    return offerNextWaiting(id);
  }

  async function reaccommodate(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const targetDepartureId = String(formData.get("target_departure_id") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!targetDepartureId || !reason) return { error: "Choose a target departure and give details." };
    const result = await reaccommodateDeparture({
      sourceDepartureId: id,
      targetDepartureId,
      type: String(formData.get("type") ?? "other") as DisruptionType,
      reason,
    });
    return result.error
      ? { error: result.error }
      : { success: true, message: `${result.moved ?? 0} moved, ${result.unplaced ?? 0} put on the waitlist.` };
  }

  const stat = (title: string, value: string, sub?: string) => (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">
        {value} {sub && <span className="text-sm font-normal text-slate-500">{sub}</span>}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/office/departures" className="text-sm text-slate-500 hover:underline">
            ← Departures
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">
            {routeName} · {departure.direction}
          </h1>
          <p className="text-sm text-slate-500">
            {formatUk(departure.depart_at, { date: "full", time: "short" })} ·{" "}
            <span className="font-medium text-slate-700">{departure.status}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/office/dispatch/${id}`} className={secondaryBtn}>
            Dispatch & route
          </Link>
          <Link href={`/office/booking-console?departure=${id}`} className={secondaryBtn}>
            Book a passenger
          </Link>
          {nextStatus && (
            <ActionForm action={advanceStatus}>
              <button type="submit" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
                {NEXT_LABEL[departure.status as DepartureStatus] ?? `Advance to ${nextStatus}`}
              </button>
            </ActionForm>
          )}
          {isLive && (
            <ActionForm
              action={cancelDeparture}
              confirm="Cancel this departure? Passengers are not moved automatically — use re-accommodate below for that."
            >
              <button
                type="submit"
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Cancel departure
              </button>
            </ActionForm>
          )}
        </div>
      </div>

      {departure.status === "draft" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Draft — not yet open for booking online and not visible to drivers. Release seats and publish when ready.
        </p>
      )}

      <section className={card}>
        <h2 className="mb-3 font-semibold text-slate-900">Capacity</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat("Seats", `${summary?.seats_used ?? 0} / ${departure.seats_released}`, `of ${departure.seats_capacity}`)}
          {stat("Hold units", `${summary?.hold_used ?? 0} / ${departure.hold_capacity_units}`)}
          {stat("Wheelchair", `${summary?.wheelchair_used ?? 0} / ${departure.wheelchair_capacity}`)}
          {stat(
            "Crossing",
            `${summary?.crossing_headcount ?? 0}${
              departure.crossing_passenger_limit ? ` / ${departure.crossing_passenger_limit}` : ""
            }`,
            departure.crossing_passenger_limit ? undefined : "no limit set"
          )}
        </div>
        {summary && (
          <p className="mt-3 text-sm text-slate-600">
            {summary.men} men · {summary.women} women · {summary.boys} boys · {summary.girls} girls · {summary.infants}{" "}
            infants
          </p>
        )}
        {isLive && (
          <ActionForm action={releaseSeats} className="mt-4 flex flex-wrap items-end gap-3">
            <label className={label}>
              Seats released for booking
              <input
                name="seats_released"
                type="number"
                min={0}
                max={departure.seats_capacity}
                defaultValue={departure.seats_released}
                className={`${input} w-32`}
              />
            </label>
            <button type="submit" className={secondaryBtn}>
              Update
            </button>
          </ActionForm>
        )}
      </section>

      <DepartureBookings
        departureId={id}
        departureStatus={departure.status as DepartureStatus}
        departAt={departure.depart_at}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 font-semibold text-slate-900">Schedule & crossing</h2>
          <p className="mb-3 text-xs text-slate-500">
            Crossing details are shown to Office, dispatch and the assigned drivers only — never to passengers.
          </p>
          <ActionForm action={saveDetails} className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Departs
              <input
                name="depart_at"
                type="datetime-local"
                required
                defaultValue={isoToUkLocal(departure.depart_at)}
                className={input}
              />
            </label>
            <label className={label}>
              Arrives (estimate)
              <input
                name="arrive_estimate"
                type="datetime-local"
                defaultValue={isoToUkLocal(departure.arrive_estimate)}
                className={input}
              />
            </label>
            <label className={label}>
              Crossing reference
              <input
                name="crossing_reference"
                defaultValue={departure.crossing_reference ?? ""}
                placeholder="e.g. LeShuttle booking ref"
                className={input}
              />
            </label>
            <label className={label}>
              Crossing check-in deadline
              <input
                name="crossing_checkin_deadline"
                type="datetime-local"
                defaultValue={isoToUkLocal(departure.crossing_checkin_deadline)}
                className={input}
              />
            </label>
            <label className={label}>
              Crossing passenger limit
              <input
                name="crossing_passenger_limit"
                type="number"
                min={0}
                defaultValue={departure.crossing_passenger_limit ?? ""}
                className={input}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Cost £
                <input
                  name="crossing_cost_gbp"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={departure.crossing_cost_gbp ?? ""}
                  className={input}
                />
              </label>
              <label className={label}>
                Cost €
                <input
                  name="crossing_cost_eur"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={departure.crossing_cost_eur ?? ""}
                  className={input}
                />
              </label>
            </div>
            <label className={`${label} sm:col-span-2`}>
              Notes
              <textarea name="notes" rows={2} defaultValue={departure.notes ?? ""} className={input} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
                Save details
              </button>
            </div>
          </ActionForm>
        </section>

        <div className="space-y-6">
          <section className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Vehicles & drivers</h2>
              <Link href={`/office/dispatch/${id}`} className="text-sm font-medium text-brand-dark underline">
                Assign drivers →
              </Link>
            </div>
            <ul className="mb-3 space-y-1 text-sm text-slate-700">
              {(assigned ?? []).length === 0 && (
                <li className="text-slate-500">No vehicle assigned yet.</li>
              )}
              {(assigned ?? []).map((a) => (
                <li key={a.id}>
                  {(a as unknown as { vehicles?: { registration?: string } }).vehicles?.registration} —{" "}
                  {a.seats_capacity} seats, {a.hold_capacity_units} hold units
                </li>
              ))}
              {(drivers ?? []).map((d) => {
                const dd = d as unknown as {
                  id: string;
                  status: string;
                  profiles?: { display_name?: string };
                  vehicles?: { registration?: string };
                };
                return (
                  <li key={dd.id} className="text-slate-600">
                    Driver: {dd.profiles?.display_name ?? "—"}
                    {dd.vehicles?.registration ? ` · ${dd.vehicles.registration}` : ""} · {dd.status}
                  </li>
                );
              })}
            </ul>
            {isLive && (
              <ActionForm action={addVehicle} className="flex flex-wrap items-end gap-3" successText="Vehicle assigned.">
                <label className={label}>
                  Add vehicle
                  <select name="vehicle_id" className={input}>
                    {(vehicles ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.registration}
                        {v.status !== "available" && v.status !== "assigned" ? ` (${v.status})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${label} min-w-[160px] flex-1`}>
                  Override reason (only if blocked)
                  <input name="override_reason" className={input} />
                </label>
                <button type="submit" className={secondaryBtn}>
                  Assign
                </button>
              </ActionForm>
            )}
          </section>

          <section className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Cash</h2>
              <Link
                href={`/office/departures/${id}/reconciliation`}
                className="text-sm font-medium text-brand-dark underline"
              >
                Reconciliation report →
              </Link>
            </div>
            <ul className="mb-3 space-y-1 text-sm">
              {(cash ?? []).map((c) => (
                <li key={c.id} className={c.reconciled_at ? "text-slate-600" : "font-medium text-amber-700"}>
                  {c.transaction_type.replaceAll("_", " ")} — {c.currency === "GBP" ? "£" : "€"}
                  {c.amount} {c.reconciled_at ? "· reconciled" : "· unreconciled"}
                </li>
              ))}
              {(!cash || cash.length === 0) && <li className="text-slate-500">No cash recorded yet.</li>}
            </ul>
            {(cash ?? []).some((c) => !c.reconciled_at) && (
              <ActionForm action={reconcileCash} successText="Reconciled.">
                <button type="submit" className={secondaryBtn}>
                  Reconcile all
                </button>
              </ActionForm>
            )}
            <p className="mt-2 text-xs text-slate-500">Unreconciled cash blocks this departure from reaching completed.</p>
          </section>

          <section className={card}>
            <h2 className="mb-3 font-semibold text-slate-900">Waitlist</h2>
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
              <ActionForm action={offerWaitlist} successText="Offer made.">
                <button type="submit" className={secondaryBtn}>
                  Offer next who fits
                </button>
              </ActionForm>
            )}
          </section>
        </div>
      </div>

      {isLive && (otherDepartures ?? []).length > 0 && (
        <section className="rounded-xl border border-red-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Disruption — re-accommodate</h2>
          <p className="mb-3 text-sm text-slate-500">
            Moves every passenger on this departure to a target departure, running the full capacity check for each.
            Anyone who doesn&apos;t fit goes onto the target&apos;s waitlist instead of being dropped. This departure is
            then cancelled.
          </p>
          <ActionForm
            action={reaccommodate}
            className="flex flex-wrap items-end gap-3"
            confirm="Move every passenger and cancel this departure?"
          >
            <label className={label}>
              Reason
              <select name="type" className={input}>
                <option value="vehicle_off_road">Vehicle off the road</option>
                <option value="crossing_cancelled">Crossing cancelled</option>
                <option value="driver_unavailable">Driver unavailable</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className={label}>
              Move to
              <select name="target_departure_id" className={input}>
                {(otherDepartures ?? []).map((d) => {
                  const rn = (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
                  return (
                    <option key={d.id} value={d.id}>
                      {rn} · {d.direction} · {formatUk(d.depart_at)}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className={`${label} min-w-[180px] flex-1`}>
              Details
              <input name="reason" required className={input} />
            </label>
            <button
              type="submit"
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Re-accommodate everyone
            </button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
