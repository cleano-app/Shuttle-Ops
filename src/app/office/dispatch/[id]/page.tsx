import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";
import { formatUk, isoToUkLocal, ukLocalToIso } from "@/lib/time";
import {
  createStop,
  deleteStop,
  setStopLocked,
  moveStop,
  updateStop,
  generateStopsFromBookings,
  getCheckinWarning,
  getDispatchPassengers,
  type DispatchPassenger,
} from "@/app/actions/operationalStops";
import { applyTemplateToDeparture, listTemplatesForRoute, saveStopsAsTemplate } from "@/app/actions/routeTemplates";
import {
  assignDriver,
  removeDriverAssignment,
  listDriverAssignmentsForDeparture,
  listDrivers,
} from "@/app/actions/driverAssignments";
import { AddStopFields, AssignDriverFields } from "./DispatchFields";
import type { StopType } from "@/types/database";

const STOP_TYPES: StopType[] = ["pickup", "dropoff", "crossing", "waypoint"];
const TYPE_LABEL: Record<string, string> = {
  pickup: "Pickup",
  dropoff: "Drop-off",
  crossing: "Crossing",
  waypoint: "Waypoint",
};
const btn = "rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
const DROPPED = new Set(["cancelled", "expired"]);

type Address = { line1?: string; postcode?: string; fixed_point_name?: string | null };
function addressText(a: Address | null | undefined) {
  if (!a) return "Unknown address";
  return `${a.fixed_point_name ? `${a.fixed_point_name} — ` : ""}${a.line1 ?? ""}, ${a.postcode ?? ""}`;
}

export default async function DispatchBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["admin", "office", "dispatcher"].includes(session.role)) redirect("/");

  const supabase = await createClient();
  const { data: departure } = await supabase
    .from("departures")
    .select("*, routes(name, id)")
    .eq("id", id)
    .single();
  if (!departure) notFound();

  const routeInfo = (departure as unknown as { routes?: { name?: string; id?: string } }).routes;

  const [
    { data: stops, error: stopsError },
    checkin,
    { assignments, error: assignmentsError },
    { drivers },
    { data: vehicles },
    { templates },
    { passengers, error: passengersError },
    { data: parcels },
    { data: areas },
  ] = await Promise.all([
    supabase
      .from("operational_stops")
      .select("*, addresses(line1, postcode, fixed_point_name)")
      .eq("departure_id", id)
      .order("planned_sequence", { ascending: true }),
    getCheckinWarning(id),
    listDriverAssignmentsForDeparture(id),
    listDrivers(),
    supabase.from("vehicles").select("id, registration, status").eq("active", true).order("registration"),
    routeInfo?.id ? listTemplatesForRoute(routeInfo.id, departure.direction) : Promise.resolve({ templates: [] }),
    getDispatchPassengers(id),
    supabase
      .from("parcels")
      .select("id, reference, status, size_category, quantity, sender_name, recipient_name, sender_address_id, recipient_address_id")
      .eq("departure_id", id),
    supabase.from("areas").select("id, name, country").eq("active", true).order("running_order"),
  ]);

  const stopIds = (stops ?? []).map((s) => s.id);
  const [{ data: stopPassengers }, { data: stopParcels }] = stopIds.length
    ? await Promise.all([
        supabase
          .from("operational_stop_passengers")
          .select("id, operational_stop_id, booking_passenger_id, role, boarded")
          .in("operational_stop_id", stopIds),
        supabase
          .from("operational_stop_parcels")
          .select("id, operational_stop_id, parcel_id, role")
          .in("operational_stop_id", stopIds),
      ])
    : [{ data: [] }, { data: [] }];

  const passengerById = new Map<string, DispatchPassenger>(passengers.map((p) => [p.booking_passenger_id, p]));
  const parcelById = new Map((parcels ?? []).map((p) => [p.id, p]));

  // Who still needs a stop - the nudge to press "Update stops".
  const linkedP = new Set((stopPassengers ?? []).map((r) => `${r.booking_passenger_id}:${r.role}`));
  const travelling = passengers.filter(
    (p) => !["cancelled", "expired", "no_show"].includes(p.status) && !DROPPED.has(p.booking_status)
  );
  const unplacedPassengers = travelling.filter(
    (p) =>
      (p.pickup_address_id && !linkedP.has(`${p.booking_passenger_id}:pickup`)) ||
      (p.dropoff_address_id && !linkedP.has(`${p.booking_passenger_id}:dropoff`))
  );
  const linkedParcels = new Set((stopParcels ?? []).map((r) => r.parcel_id));
  const unplacedParcels = (parcels ?? []).filter(
    (p) => !["cancelled", "delivered"].includes(p.status) && !linkedParcels.has(p.id)
  );
  const noAddress = travelling.filter((p) => !p.pickup_address_id && !p.dropoff_address_id);

  const stopOptions = (stops ?? []).map((s, i) => ({
    sequence: s.planned_sequence,
    label: `${i + 1}. ${addressText((s as unknown as { addresses?: Address }).addresses)}`,
  }));
  const stopNumberBySequence = new Map((stops ?? []).map((s, i) => [s.planned_sequence, i + 1]));

  // --- Server actions (each returns its result so ActionForm can show it) ---
  async function generateStops(): Promise<FormResult> {
    "use server";
    return generateStopsFromBookings(id);
  }

  async function addStop(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const addressId = String(formData.get("address_id") ?? "");
    if (!addressId) return { error: "Choose an address from the search results first." };
    return createStop({
      departure_id: id,
      address_id: addressId,
      stop_type: String(formData.get("stop_type") ?? "waypoint") as StopType,
      planned_arrival_at: ukLocalToIso(String(formData.get("planned_arrival_at") ?? "")),
    });
  }

  async function applyTemplate(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const templateId = String(formData.get("template_id") ?? "");
    if (!templateId) return { error: "Choose a template." };
    return applyTemplateToDeparture({ templateId, departureId: id, departAt: departure!.depart_at });
  }

  async function saveTemplate(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return saveStopsAsTemplate({
      departureId: id,
      name: String(formData.get("name") ?? ""),
      notes: String(formData.get("notes") ?? "") || null,
    });
  }

  async function moveUp(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return moveStop(id, String(formData.get("stop_id")), "up");
  }
  async function moveDown(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return moveStop(id, String(formData.get("stop_id")), "down");
  }
  async function toggleLock(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return setStopLocked(String(formData.get("stop_id")), formData.get("locked") !== "true");
  }
  async function removeStop(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return deleteStop(String(formData.get("stop_id")));
  }
  async function editStop(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return updateStop(String(formData.get("stop_id")), {
      stop_type: String(formData.get("stop_type")) as StopType,
      planned_arrival_at: ukLocalToIso(String(formData.get("planned_arrival_at") ?? "")),
      driver_notes: String(formData.get("driver_notes") ?? "").trim() || null,
    });
  }

  async function addDriverAssignment(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const seq = (name: string) => {
      const v = String(formData.get(name) ?? "");
      return v === "" ? null : Number(v);
    };
    const res = await assignDriver({
      departure_id: id,
      vehicle_id: String(formData.get("vehicle_id") ?? ""),
      driver_id: String(formData.get("driver_id") ?? ""),
      role: formData.get("role") === "co_driver" ? "co_driver" : "driver",
      from_stop_sequence: seq("from_stop_sequence"),
      to_stop_sequence: seq("to_stop_sequence"),
      override_reason: String(formData.get("override_reason") ?? "").trim() || null,
    });
    if (res.error) return res;
    return {
      success: true,
      message:
        departure!.status === "draft"
          ? "Driver assigned. They'll see it once the departure is published."
          : "Driver assigned. It's on their phone now, waiting for them to accept.",
    };
  }
  async function removeAssignment(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return removeDriverAssignment(String(formData.get("assignment_id")), id);
  }

  const risk = checkin.risk;
  const isDraft = departure.status === "draft";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/office/dispatch" className="text-sm text-slate-500 hover:underline">
          ← Dispatch
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          {routeInfo?.name ?? "Route"} · {departure.direction}
        </h1>
        <p className="text-sm text-slate-500">
          {formatUk(departure.depart_at, { date: "full", time: "short" })} · {departure.status}
        </p>
        <a
          href={`/api/pdf/manifest/${id}`}
          className="mt-2 inline-block text-sm font-medium text-brand-dark underline"
        >
          Download fallback manifest (PDF)
        </a>
      </div>

      {isDraft && (
        <div className="rounded-lg border border-amber bg-amber-bg p-3 text-sm text-amber-text">
          This departure is still a <strong>draft</strong>. You can plan stops and assign drivers now, but drivers
          only see it once it&apos;s published.
        </div>
      )}

      {departure.crossing_checkin_deadline && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            risk?.atRisk ? "border-red-300 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          <p className="font-medium">
            Crossing check-in: {formatUk(departure.crossing_checkin_deadline, { time: "short" })}
            {departure.crossing_reference ? ` · Ref ${departure.crossing_reference}` : ""}
          </p>
          {checkin.error ? (
            <p className="text-red-700">Couldn&apos;t project arrival: {checkin.error}</p>
          ) : risk ? (
            <p>
              Projected arrival {formatUk(risk.projectedArrivalAt, { time: "short" })} —{" "}
              {risk.atRisk
                ? `${Math.abs(risk.marginMinutes)} minutes late. Check-in at risk of being missed.`
                : `${risk.marginMinutes} minutes to spare.`}
              <span className="block text-xs text-slate-500">
                Estimate from this shuttle&apos;s past runs and route template timings - not live traffic.
                {checkin.missingTimes && " Some stops before the crossing have no planned time yet."}
              </span>
            </p>
          ) : checkin.missingCrossing ? (
            <p className="text-slate-600">
              Add a <strong>Crossing</strong> stop (the terminal) between the last pickup and the first drop-off to get
              the check-in projection.
            </p>
          ) : (
            <p className="text-slate-500">Add stops to see a check-in risk projection.</p>
          )}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-1">
          <h2 className="font-medium text-slate-900">Stops</h2>
          <p className="text-sm text-slate-500">
            {travelling.length} travelling passenger{travelling.length === 1 ? "" : "s"} ·{" "}
            {(parcels ?? []).filter((p) => p.status !== "cancelled").length} parcel
            {(parcels ?? []).filter((p) => p.status !== "cancelled").length === 1 ? "" : "s"}
            {(unplacedPassengers.length > 0 || unplacedParcels.length > 0) && (
              <span className="font-medium text-amber-text">
                {" "}
                · {unplacedPassengers.length} passenger{unplacedPassengers.length === 1 ? "" : "s"} and{" "}
                {unplacedParcels.length} parcel{unplacedParcels.length === 1 ? "" : "s"} not on a stop yet
              </span>
            )}
          </p>
          {passengersError && (
            <p className="text-sm text-red-700">Couldn&apos;t load passengers: {passengersError}</p>
          )}
          {noAddress.length > 0 && (
            <p className="text-sm text-amber-text">
              {noAddress.length} passenger{noAddress.length === 1 ? " has" : "s have"} no pickup or drop-off address:{" "}
              {noAddress.map((p) => p.full_name).join(", ")}.
            </p>
          )}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          <ActionForm action={generateStops}>
            <button type="submit" className="w-full rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white sm:w-auto">
              {(stops ?? []).length === 0 ? "Generate stops from bookings" : "Update stops from bookings"}
            </button>
          </ActionForm>
          {(stops ?? []).length === 0 && (templates ?? []).length > 0 && (
            <ActionForm action={applyTemplate} className="flex flex-wrap items-center gap-2">
              <select name="template_id" className="rounded border border-slate-300 px-2 py-2 text-sm">
                {templates!.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Apply template
              </button>
            </ActionForm>
          )}
        </div>
        {stopsError && <p className="mb-3 text-sm text-red-700">Couldn&apos;t load stops: {stopsError.message}</p>}

        {(stops ?? []).length === 0 && (
          <p className="mb-4 rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No stops yet. Generate them from bookings{(templates ?? []).length > 0 ? ", apply a template," : ""} or add
            one by hand below.
          </p>
        )}

        <ol className="space-y-3">
          {(stops ?? []).map((stop, index) => {
            const address = (stop as unknown as { addresses?: Address }).addresses;
            const riders = (stopPassengers ?? []).filter((sp) => sp.operational_stop_id === stop.id);
            const stopParcelRows = (stopParcels ?? []).filter((sp) => sp.operational_stop_id === stop.id);
            const editable = !stop.locked && stop.status === "pending";
            return (
              <li key={stop.id} className={`rounded border p-3 ${stop.locked ? "border-slate-400 bg-slate-50" : "border-slate-200"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {index + 1}. {addressText(address)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {TYPE_LABEL[stop.stop_type] ?? stop.stop_type} · {stop.status}
                      {stop.locked && " · 🔒 locked"}
                      {stop.planned_arrival_at && ` · planned ${formatUk(stop.planned_arrival_at, { time: "short" })}`}
                      {stop.actual_arrival_at && ` · arrived ${formatUk(stop.actual_arrival_at, { time: "short" })}`}
                    </p>
                    {stop.driver_notes && <p className="text-sm text-amber-text">{stop.driver_notes}</p>}
                    {riders.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                        {riders.map((sp) => {
                          const p = passengerById.get(sp.booking_passenger_id);
                          const dropped = p && (DROPPED.has(p.status) || DROPPED.has(p.booking_status));
                          return (
                            <li key={sp.id} className={dropped ? "text-slate-400 line-through" : ""}>
                              {sp.role === "pickup" ? "↑" : "↓"} {p?.full_name ?? "Passenger"}
                              {p && (
                                <span className="text-slate-500">
                                  {" "}
                                  · {p.category} · {p.luggage_large + p.luggage_small} case
                                  {p.luggage_large + p.luggage_small === 1 ? "" : "s"}
                                  {p.luggage_oversize > 0 && ` · ${p.luggage_oversize} oversize`}
                                  {p.wheelchair_space && " · wheelchair"}
                                  {p.phone && ` · ${p.phone}`}
                                  {p.booking_reference && ` · ${p.booking_reference}`}
                                </span>
                              )}
                              {sp.boarded && <span className="text-green"> · boarded</span>}
                              {dropped && <span className="no-underline"> ({p!.status})</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {stopParcelRows.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                        {stopParcelRows.map((r) => {
                          const pc = parcelById.get(r.parcel_id);
                          return (
                            <li key={r.id} className={pc?.status === "cancelled" ? "text-slate-400 line-through" : ""}>
                              📦 {r.role === "collection" ? "Collect" : "Deliver"} {pc?.reference ?? "parcel"}
                              {pc && (
                                <span className="text-slate-500">
                                  {" "}
                                  · {pc.size_category} ×{pc.quantity} ·{" "}
                                  {r.role === "collection" ? `from ${pc.sender_name}` : `to ${pc.recipient_name}`} · {pc.status}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <ActionForm action={moveUp}>
                      <input type="hidden" name="stop_id" value={stop.id} />
                      <button type="submit" className={btn} aria-label="Move stop up">
                        ↑
                      </button>
                    </ActionForm>
                    <ActionForm action={moveDown}>
                      <input type="hidden" name="stop_id" value={stop.id} />
                      <button type="submit" className={btn} aria-label="Move stop down">
                        ↓
                      </button>
                    </ActionForm>
                    <ActionForm action={toggleLock}>
                      <input type="hidden" name="stop_id" value={stop.id} />
                      <input type="hidden" name="locked" value={String(stop.locked)} />
                      <button type="submit" className={btn}>
                        {stop.locked ? "Unlock" : "Lock"}
                      </button>
                    </ActionForm>
                    {editable && (
                      <ActionForm action={removeStop} confirm="Remove this stop? Passengers on it go back to 'not on a stop'.">
                        <input type="hidden" name="stop_id" value={stop.id} />
                        <button type="submit" className="rounded border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                          Remove
                        </button>
                      </ActionForm>
                    )}
                  </div>
                </div>
                {editable && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-brand-dark">Edit stop</summary>
                    <ActionForm action={editStop} successText="Saved." className="mt-2 grid gap-2 sm:grid-cols-[10rem_12rem_minmax(0,1fr)_auto] sm:items-end">
                      <input type="hidden" name="stop_id" value={stop.id} />
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Type</span>
                        <select name="stop_type" defaultValue={stop.stop_type} className="w-full rounded border border-slate-300 px-2 py-2 text-sm">
                          {STOP_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Planned arrival (UK)</span>
                        <input
                          type="datetime-local"
                          name="planned_arrival_at"
                          defaultValue={isoToUkLocal(stop.planned_arrival_at)}
                          className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Note for the driver</span>
                        <input
                          name="driver_notes"
                          defaultValue={stop.driver_notes ?? ""}
                          className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
                        />
                      </label>
                      <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                        Save
                      </button>
                    </ActionForm>
                    <p className="mt-1 text-xs text-slate-500">
                      Tip: lock a stop after setting its time by hand - &ldquo;Update stops&rdquo; re-estimates unlocked
                      stops.
                    </p>
                  </details>
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-sm font-medium text-slate-900">Add a stop</h3>
          <ActionForm action={addStop}>
            <AddStopFields areas={areas ?? []} />
          </ActionForm>
        </div>

        {(stops ?? []).length > 0 && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="mb-2 text-sm font-medium text-slate-900">Save stop order as template</h3>
            <ActionForm action={saveTemplate} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <input
                name="name"
                required
                placeholder={`e.g. ${routeInfo?.name ?? "Route"} ${departure.direction} standard`}
                className="rounded border border-slate-300 px-3 py-2 text-sm sm:w-72"
              />
              <input name="notes" placeholder="Notes (optional)" className="rounded border border-slate-300 px-3 py-2 text-sm sm:w-72" />
              <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Save as template
              </button>
            </ActionForm>
            <p className="mt-1 text-xs text-slate-500">
              Saves each stop&apos;s address, type and minutes after departure. Manage templates on the{" "}
              <Link href="/office/dispatch" className="underline">
                Dispatch
              </Link>{" "}
              page.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Drivers &amp; vehicles</h2>
        {assignmentsError && <p className="mb-2 text-sm text-red-700">{assignmentsError}</p>}
        <ul className="mb-4 divide-y divide-slate-100 text-sm text-slate-700">
          {(assignments ?? []).length === 0 && <li className="py-1 text-slate-500">No drivers assigned yet.</li>}
          {(assignments ?? []).map((a) => {
            const driverName = (a as unknown as { profiles?: { display_name?: string } }).profiles?.display_name;
            const vehicleReg = (a as unknown as { vehicles?: { registration?: string } }).vehicles?.registration;
            const from = a.from_stop_sequence != null ? stopNumberBySequence.get(a.from_stop_sequence) : null;
            const to = a.to_stop_sequence != null ? stopNumberBySequence.get(a.to_stop_sequence) : null;
            const segment =
              a.from_stop_sequence == null && a.to_stop_sequence == null
                ? "whole route"
                : `stop ${a.from_stop_sequence == null ? "1" : (from ?? `#${a.from_stop_sequence}?`)} → ${
                    a.to_stop_sequence == null ? "end" : (to ?? `#${a.to_stop_sequence}?`)
                  }`;
            return (
              <li key={a.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <strong>{driverName ?? "Driver"}</strong> {a.role === "co_driver" ? "(co-driver) " : ""}— {vehicleReg ?? "Vehicle"} · {segment} ·{" "}
                  <span className={a.status === "accepted" ? "text-green" : a.status === "declined" ? "text-red-700" : "text-slate-500"}>
                    {a.status}
                  </span>
                  {a.override_reason && <span className="block text-xs text-amber-text">Override: {a.override_reason}</span>}
                </span>
                <ActionForm action={removeAssignment} confirm={`Remove ${driverName ?? "this driver"} from this departure?`}>
                  <input type="hidden" name="assignment_id" value={a.id} />
                  <button type="submit" className="text-sm text-red-600 underline">
                    Remove
                  </button>
                </ActionForm>
              </li>
            );
          })}
        </ul>
        <ActionForm action={addDriverAssignment}>
          <AssignDriverFields
            drivers={drivers ?? []}
            vehicles={(vehicles ?? []) as { id: string; registration: string; status: string }[]}
            stops={stopOptions}
            isAdmin={session.role === "admin"}
          />
        </ActionForm>
      </section>
    </div>
  );
}
