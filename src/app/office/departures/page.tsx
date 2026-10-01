import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createDeparture } from "@/app/actions/departures";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";
import { formatUk, ukLocalToIso } from "@/lib/time";
import { journeyLabel } from "@/lib/journey";
import { JourneyBadge } from "@/components/JourneyBadge";
import type { DepartureDirection } from "@/types/database";
import { journeyStartColor } from "@/components/Journey";

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "block text-sm font-medium text-slate-700";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-50 text-amber-800 ring-amber-200",
  published: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  boarding: "bg-sky-50 text-sky-800 ring-sky-200",
  departed: "bg-sky-50 text-sky-800 ring-sky-200",
  completed: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
};

type DepartureRow = {
  id: string;
  direction: string;
  depart_at: string;
  status: string;
  seats_capacity: number;
  seats_released: number;
  routes?: { name?: string } | null;
};

export default async function DeparturesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const showPast = show === "past";
  const nowIso = new Date().toISOString();
  const supabase = await createClient();

  let query = supabase
    .from("departures")
    .select("id, direction, depart_at, status, seats_capacity, seats_released, routes(name)");
  query = showPast
    ? query.lt("depart_at", nowIso).order("depart_at", { ascending: false }).limit(60)
    : query.gte("depart_at", nowIso).order("depart_at", { ascending: true }).limit(60);

  const [{ data: departures }, { data: routes }, { data: summaries }] = await Promise.all([
    query,
    supabase.from("routes").select("id, name").eq("active", true).order("name"),
    supabase.from("departure_capacity_summary").select("departure_id, seats_used"),
  ]);
  const used = new Map((summaries ?? []).map((s) => [s.departure_id, s.seats_used ?? 0]));

  async function addDeparture(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const [routeId = "", direction = "outbound"] = String(formData.get("journey") ?? "").split("|");
    const departAt = ukLocalToIso(String(formData.get("depart_at") ?? ""));
    const seatsCapacity = Number(formData.get("seats_capacity") ?? 0);
    if (!routeId || !departAt || !seatsCapacity) return { error: "Route, time and seats are required." };
    const releaseNow = formData.get("release_all") === "on";
    const limit = String(formData.get("crossing_passenger_limit") ?? "").trim();
    const result = await createDeparture({
      route_id: routeId,
      direction: direction as DepartureDirection,
      depart_at: departAt,
      seats_capacity: seatsCapacity,
      hold_capacity_units: Number(formData.get("hold_capacity_units") ?? 0),
      wheelchair_capacity: Number(formData.get("wheelchair_capacity") ?? 0),
      crossing_reference: String(formData.get("crossing_reference") ?? "").trim() || null,
      crossing_passenger_limit: limit ? Number(limit) : null,
      crossing_checkin_deadline: ukLocalToIso(String(formData.get("crossing_checkin_deadline") ?? "")),
      ...(releaseNow ? { seats_released: seatsCapacity } : {}),
    });
    return result.error ? result : { success: true, message: "Departure created as a draft." };
  }

  const rows = (departures ?? []) as unknown as DepartureRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Departures</h1>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <Link
            href="/office/departures"
            className={`rounded-md px-3 py-1.5 ${!showPast ? "bg-brand-dark text-white" : "text-slate-600"}`}
          >
            Upcoming
          </Link>
          <Link
            href="/office/departures?show=past"
            className={`rounded-md px-3 py-1.5 ${showPast ? "bg-brand-dark text-white" : "text-slate-600"}`}
          >
            Past
          </Link>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4" open={rows.length === 0 && !showPast}>
        <summary className="cursor-pointer font-semibold text-slate-900">+ New departure</summary>
        <ActionForm action={addDeparture} className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <label className={`${label} col-span-2`}>
            Journey
            <select name="journey" required className={input}>
              {(routes ?? []).flatMap((r) =>
                (["outbound", "return"] as const).map((dir) => (
                  <option key={`${r.id}|${dir}`} value={`${r.id}|${dir}`}>
                    {journeyLabel(r.name, dir)}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className={label}>
            Departs (UK time)
            <input name="depart_at" type="datetime-local" required className={input} />
          </label>
          <label className={label}>
            Seats
            <input name="seats_capacity" type="number" min={1} required defaultValue={16} className={input} />
          </label>
          <label className={label}>
            Hold units
            <input name="hold_capacity_units" type="number" min={0} defaultValue={26} className={input} />
          </label>
          <label className={label}>
            Wheelchair spaces
            <input name="wheelchair_capacity" type="number" min={0} defaultValue={0} className={input} />
          </label>
          <label className={label}>
            Crossing limit
            <input name="crossing_passenger_limit" type="number" min={0} className={input} />
          </label>
          <label className={`${label} col-span-2`}>
            Crossing reference
            <input name="crossing_reference" className={input} />
          </label>
          <label className={`${label} col-span-2`}>
            Crossing check-in deadline
            <input name="crossing_checkin_deadline" type="datetime-local" className={input} />
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input name="release_all" type="checkbox" defaultChecked className="h-4 w-4" />
            Release all seats for booking now
          </label>
          <div className="col-span-2 flex items-end justify-end">
            <button type="submit" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
              Create departure
            </button>
          </div>
        </ActionForm>
      </details>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {showPast ? "No past departures." : "No upcoming departures. Create one above."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {rows.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/office/departures/${d.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-s-4 p-4 hover:bg-slate-50"
                  style={{ borderInlineStartColor: journeyStartColor(d.routes?.name, d.direction) }}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {formatUk(d.depart_at, { date: "full", time: "short" })}
                    </p>
                    <JourneyBadge routeName={d.routes?.name} direction={d.direction} className="mt-1" />
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-600">
                      {used.get(d.id) ?? 0} booked / {d.seats_released} released
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLE[d.status] ?? ""}`}
                    >
                      {d.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
