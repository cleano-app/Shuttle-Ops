import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  createStop,
  deleteStop,
  setStopLocked,
  moveStop,
  generateStopsFromBookings,
  getCheckinWarning,
} from "@/app/actions/operationalStops";
import { applyTemplateToDeparture, listTemplatesForRoute } from "@/app/actions/routeTemplates";
import { assignDriver, removeDriverAssignment, listDriverAssignmentsForDeparture, listDrivers } from "@/app/actions/driverAssignments";

export default async function DispatchBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: departure } = await supabase
    .from("departures")
    .select("*, routes(name, id)")
    .eq("id", id)
    .single();
  if (!departure) notFound();

  const routeInfo = (departure as unknown as { routes?: { name?: string; id?: string } }).routes;

  const [{ data: stops }, { risk }, { assignments }, { drivers }, { data: vehicles }, { templates }] =
    await Promise.all([
      supabase
        .from("operational_stops")
        .select("*, addresses(line1, postcode, fixed_point_name)")
        .eq("departure_id", id)
        .order("planned_sequence", { ascending: true }),
      getCheckinWarning(id),
      listDriverAssignmentsForDeparture(id),
      listDrivers(),
      supabase.from("vehicles").select("id, registration").eq("active", true).order("registration"),
      routeInfo?.id ? listTemplatesForRoute(routeInfo.id, departure.direction) : Promise.resolve({ templates: [] }),
    ]);

  // Passengers per stop, fetched separately since it's a two-hop join
  // (operational_stop_passengers -> booking_passengers -> passengers).
  const stopIds = (stops ?? []).map((s) => s.id);
  const { data: stopPassengers } = stopIds.length
    ? await supabase
        .from("operational_stop_passengers")
        .select("id, operational_stop_id, role, boarded, booking_passengers(luggage_large, luggage_small, luggage_hand, luggage_oversize, passengers(full_name))")
        .in("operational_stop_id", stopIds)
    : { data: [] };

  async function addStop(formData: FormData) {
    "use server";
    const addressLine1 = String(formData.get("address_id") ?? "");
    if (!addressLine1) return;
    await createStop({
      departure_id: id,
      address_id: addressLine1,
      stop_type: (String(formData.get("stop_type") ?? "waypoint")) as "pickup" | "dropoff" | "crossing" | "waypoint",
      planned_sequence: (stops?.length ?? 0) + 1,
    });
  }

  async function generateStops() {
    "use server";
    await generateStopsFromBookings(id);
  }

  async function applyTemplate(formData: FormData) {
    "use server";
    const templateId = String(formData.get("template_id") ?? "");
    if (!templateId) return;
    await applyTemplateToDeparture({ templateId, departureId: id, departAt: departure!.depart_at });
  }

  async function moveStopUp(formData: FormData) {
    "use server";
    await moveStop(id, String(formData.get("stop_id")), "up");
  }
  async function moveStopDown(formData: FormData) {
    "use server";
    await moveStop(id, String(formData.get("stop_id")), "down");
  }
  async function toggleLock(formData: FormData) {
    "use server";
    const stopId = String(formData.get("stop_id"));
    const locked = formData.get("locked") === "true";
    await setStopLocked(stopId, !locked);
  }
  async function removeStop(formData: FormData) {
    "use server";
    await deleteStop(String(formData.get("stop_id")));
  }

  async function addDriverAssignment(formData: FormData) {
    "use server";
    const driverId = String(formData.get("driver_id") ?? "");
    const vehicleId = String(formData.get("vehicle_id") ?? "");
    if (!driverId || !vehicleId) return;
    await assignDriver({ departure_id: id, vehicle_id: vehicleId, driver_id: driverId });
  }
  async function removeAssignment(formData: FormData) {
    "use server";
    await removeDriverAssignment(String(formData.get("assignment_id")), id);
  }

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
          {new Date(departure.depart_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}
        </p>
        <a
          href={`/api/pdf/manifest/${id}`}
          className="mt-2 inline-block text-sm font-medium text-brand-dark underline"
        >
          Download fallback manifest (PDF)
        </a>
      </div>

      {departure.crossing_checkin_deadline && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            risk?.atRisk
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          <p className="font-medium">
            Crossing check-in: {new Date(departure.crossing_checkin_deadline).toLocaleTimeString("en-GB", { timeStyle: "short" })}
            {departure.crossing_reference ? ` · Ref ${departure.crossing_reference}` : ""}
          </p>
          {risk ? (
            <p>
              Projected arrival {risk.projectedArrivalAt.toLocaleTimeString("en-GB", { timeStyle: "short" })} —{" "}
              {risk.atRisk
                ? `${Math.abs(risk.marginMinutes)} minutes late. Check-in at risk of being missed.`
                : `${risk.marginMinutes} minutes to spare.`}
            </p>
          ) : (
            <p className="text-slate-500">Add stops to see a check-in risk projection.</p>
          )}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Stops</h2>

        {(!stops || stops.length === 0) && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <form action={generateStops}>
              <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
                Generate stops from bookings
              </button>
            </form>
            {(templates ?? []).length > 0 && (
              <form action={applyTemplate} className="flex items-center gap-2">
                <select name="template_id" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  {templates!.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Apply template
                </button>
              </form>
            )}
          </div>
        )}

        <ul className="space-y-3">
          {(stops ?? []).map((stop, index) => {
            const address = (stop as unknown as { addresses?: { line1?: string; postcode?: string; fixed_point_name?: string } }).addresses;
            const passengers = (stopPassengers ?? []).filter((sp) => sp.operational_stop_id === stop.id);
            return (
              <li key={stop.id} className="rounded border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {index + 1}. {address?.fixed_point_name ? `${address.fixed_point_name} — ` : ""}
                      {address?.line1}, {address?.postcode}
                    </p>
                    <p className="text-sm text-slate-500">
                      {stop.stop_type} · {stop.status}
                      {stop.locked && " · locked"}
                      {stop.planned_arrival_at &&
                        ` · planned ${new Date(stop.planned_arrival_at).toLocaleTimeString("en-GB", { timeStyle: "short" })}`}
                    </p>
                    {passengers.length > 0 && (
                      <ul className="mt-1 text-sm text-slate-600">
                        {passengers.map((sp) => {
                          const bp = (sp as unknown as {
                            booking_passengers?: {
                              luggage_large: number;
                              luggage_small: number;
                              luggage_hand: number;
                              luggage_oversize: number;
                              passengers?: { full_name?: string };
                            };
                          }).booking_passengers;
                          return (
                            <li key={sp.id}>
                              {sp.role === "pickup" ? "↑" : "↓"} {bp?.passengers?.full_name ?? "Passenger"} —{" "}
                              {(bp?.luggage_large ?? 0) + (bp?.luggage_small ?? 0)} suitcases
                              {sp.boarded && " · boarded"}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <form action={moveStopUp}>
                      <input type="hidden" name="stop_id" value={stop.id} />
                      <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                        ↑
                      </button>
                    </form>
                    <form action={moveStopDown}>
                      <input type="hidden" name="stop_id" value={stop.id} />
                      <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                        ↓
                      </button>
                    </form>
                    <form action={toggleLock}>
                      <input type="hidden" name="stop_id" value={stop.id} />
                      <input type="hidden" name="locked" value={String(stop.locked)} />
                      <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                        {stop.locked ? "Unlock" : "Lock"}
                      </button>
                    </form>
                    {!stop.locked && (
                      <form action={removeStop}>
                        <input type="hidden" name="stop_id" value={stop.id} />
                        <button type="submit" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                          Remove
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {stops && stops.length > 0 && (
          <form action={addStop} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Address ID</label>
              <input name="address_id" placeholder="Paste an address UUID" className="w-64 rounded border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
              <select name="stop_type" className="rounded border border-slate-300 px-2 py-2 text-sm">
                <option value="waypoint">Waypoint</option>
                <option value="pickup">Pickup</option>
                <option value="dropoff">Dropoff</option>
                <option value="crossing">Crossing</option>
              </select>
            </div>
            <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Add stop
            </button>
          </form>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Drivers &amp; vehicle</h2>
        <ul className="mb-4 text-sm text-slate-700">
          {(assignments ?? []).length === 0 && <li className="text-slate-500">No drivers assigned yet.</li>}
          {(assignments ?? []).map((a) => {
            const driverName = (a as unknown as { profiles?: { display_name?: string } }).profiles?.display_name;
            const vehicleReg = (a as unknown as { vehicles?: { registration?: string } }).vehicles?.registration;
            return (
              <li key={a.id} className="flex items-center justify-between py-1">
                <span>
                  {driverName ?? "Driver"} — {vehicleReg ?? "Vehicle"} ({a.status})
                </span>
                <form action={removeAssignment}>
                  <input type="hidden" name="assignment_id" value={a.id} />
                  <button type="submit" className="text-sm text-red-600 underline">
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        <form action={addDriverAssignment} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Driver</label>
            <select name="driver_id" className="rounded border border-slate-300 px-2 py-2 text-sm">
              {(drivers ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Vehicle</label>
            <select name="vehicle_id" className="rounded border border-slate-300 px-2 py-2 text-sm">
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
