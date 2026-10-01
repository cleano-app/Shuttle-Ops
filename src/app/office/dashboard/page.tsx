import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { formatUk, isoToUkLocal, ukLocalToIso } from "@/lib/time";
import { AddFab } from "@/components/shell/AddFab";
import { Journey, journeyStartColor } from "@/components/Journey";
import { LiveRefresh } from "@/components/LiveRefresh";
import { DayPicker } from "@/components/office/DayPicker";
import { LiveDriversMap } from "@/components/office/LiveDriversMap";
import { getLiveDriverLocations } from "@/app/actions/driverLocation";
import { getCheckinWarning } from "@/app/actions/operationalStops";
import { getFxRates } from "@/lib/fx";
import { CurrencyConverter } from "@/components/office/CurrencyConverter";

type DepartureRow = {
  id: string;
  direction: string;
  depart_at: string;
  status: string;
  seats_released: number;
  crossing_reference: string | null;
  crossing_checkin_deadline: string | null;
  routes?: { name?: string } | null;
};
type StopRow = {
  departure_id: string;
  planned_sequence: number;
  status: string;
  stop_type: string;
  planned_arrival_at: string | null;
  actual_arrival_at: string | null;
  addresses?: { line1?: string; fixed_point_name?: string | null } | null;
};
type DriverRow = {
  departure_id: string;
  status: string;
  profiles?: { display_name?: string } | null;
  vehicles?: { registration?: string } | null;
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-50 text-amber-800 ring-amber-200",
  published: "bg-slate-100 text-slate-700 ring-slate-200",
  boarding: "bg-sky-50 text-sky-800 ring-sky-200",
  departed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  completed: "bg-slate-100 text-slate-500 ring-slate-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Not started",
  boarding: "Boarding",
  departed: "On the road",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Office dashboard (owner, 1 Oct 2026): today's departures with live
 * progress, refreshed automatically, plus a map of where the drivers are.
 * Any other day can be picked; later days collapse to "Coming up".
 */
export default async function OfficeDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { day: dayParam } = await searchParams;
  const today = isoToUkLocal(new Date().toISOString()).slice(0, 10);
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : today;
  const isToday = day === today;
  const dayStart = ukLocalToIso(`${day}T00:00`)!;
  const dayEnd = ukLocalToIso(`${day}T23:59`)!;

  const session = await getSession();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // The day's departures, plus — on today — anything still on the road
  // from an earlier start.
  const dayQuery = supabase
    .from("departures")
    .select("id, direction, depart_at, status, seats_released, crossing_reference, crossing_checkin_deadline, routes(name)")
    .neq("status", "cancelled")
    .order("depart_at", { ascending: true });
  const [{ data: dayDeps }, { data: running }, { data: upcoming }] = await Promise.all([
    dayQuery.gte("depart_at", dayStart).lte("depart_at", dayEnd),
    isToday
      ? supabase
          .from("departures")
          .select("id, direction, depart_at, status, seats_released, crossing_reference, crossing_checkin_deadline, routes(name)")
          .in("status", ["boarding", "departed"])
          .lt("depart_at", dayStart)
      : Promise.resolve({ data: [] }),
    supabase
      .from("departures")
      .select("id, direction, depart_at, status, seats_released, routes(name)")
      .in("status", ["draft", "published"])
      .gt("depart_at", dayEnd)
      .order("depart_at", { ascending: true })
      .limit(5),
  ]);
  const departures = [...((running ?? []) as DepartureRow[]), ...((dayDeps ?? []) as unknown as DepartureRow[])];
  const ids = departures.map((d) => d.id);
  const upcomingIds = ((upcoming ?? []) as unknown as DepartureRow[]).map((d) => d.id);

  const [
    { data: summaries },
    { data: stops },
    { data: drivers },
    { data: boardedRows },
    live,
    { count: awaitingConfirmation },
    { count: undecidedCancellations },
    { count: unreconciledCash },
    { count: openFleetTasks },
  ] = await Promise.all([
    supabase
      .from("departure_capacity_summary")
      .select("departure_id, seats_used, crossing_headcount")
      .in("departure_id", [...ids, ...upcomingIds].length ? [...ids, ...upcomingIds] : ["00000000-0000-0000-0000-000000000000"]),
    ids.length
      ? supabase
          .from("operational_stops")
          .select("departure_id, planned_sequence, status, stop_type, planned_arrival_at, actual_arrival_at, addresses(line1, fixed_point_name)")
          .in("departure_id", ids)
          .order("planned_sequence", { ascending: true })
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from("driver_assignments")
          .select("departure_id, status, profiles:driver_id(display_name), vehicles(registration)")
          .in("departure_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from("booking_passengers")
          .select("id, bookings!inner(departure_id)")
          .in("bookings.departure_id", ids)
          .not("boarded_at", "is", null)
          .not("status", "in", "(cancelled,expired)")
      : Promise.resolve({ data: [] }),
    isToday ? getLiveDriverLocations() : Promise.resolve({ locations: [], error: undefined }),
    supabase
      .from("booking_passengers")
      .select("id, bookings!inner(departure_id, departures!inner(depart_at))", { count: "exact", head: true })
      .in("status", ["provisional", "deposit_pending"])
      .gte("bookings.departures.depart_at", nowIso),
    supabase.from("cancellations").select("id", { count: "exact", head: true }).is("decided_outcome", null),
    supabase.from("cash_transactions").select("id", { count: "exact", head: true }).is("reconciled_at", null),
    supabase.from("fleet_tasks").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const warnings = new Map(
    isToday
      ? await Promise.all(
          departures
            .filter((d) => d.crossing_checkin_deadline && d.status !== "completed")
            .map(async (d) => [d.id, (await getCheckinWarning(d.id)).risk] as const)
        )
      : []
  );

  const fx = await getFxRates();

  const summaryOf = new Map((summaries ?? []).map((s) => [s.departure_id, s]));
  const stopsOf = new Map<string, StopRow[]>();
  for (const s of (stops ?? []) as unknown as StopRow[]) stopsOf.set(s.departure_id, [...(stopsOf.get(s.departure_id) ?? []), s]);
  const driversOf = new Map<string, DriverRow[]>();
  for (const d of (drivers ?? []) as unknown as DriverRow[]) driversOf.set(d.departure_id, [...(driversOf.get(d.departure_id) ?? []), d]);
  const boardedOf = new Map<string, number>();
  for (const b of (boardedRows ?? []) as unknown as { bookings?: { departure_id?: string } }[]) {
    const id = b.bookings?.departure_id;
    if (id) boardedOf.set(id, (boardedOf.get(id) ?? 0) + 1);
  }
  const lastPingOf = new Map(live.locations.filter((l) => l.departureId).map((l) => [l.departureId!, l]));

  const firstName = session?.displayName?.split(" ")[0];
  const attention = [
    { count: awaitingConfirmation ?? 0, label: "passengers awaiting deposit or confirmation", href: "/office/departures" },
    { count: undecidedCancellations ?? 0, label: "cancellations to decide", href: "/office/cancellations" },
    { count: unreconciledCash ?? 0, label: "cash entries to reconcile", href: "/office/departures?show=past" },
    { count: openFleetTasks ?? 0, label: "open fleet tasks", href: "/office/fleet" },
    { count: (await supabase.from("booking_requests").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0, label: "online booking requests to call back", href: "/office/requests" },
  ].filter((a) => a.count > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {isToday ? (firstName ? `Hello, ${firstName}` : "Today") : formatUk(dayStart, { date: "full" })}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {isToday ? formatUk(new Date(), { date: "full" }) : "Departures that day"}
            {isToday && <LiveRefresh seconds={20} />}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DayPicker day={day} today={today} basePath="/office/dashboard" />
          <Link
            href="/office/departures/new"
            className="hidden rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 md:inline-block"
          >
            + New departure
          </Link>
        </div>
      </div>

      {fx && (
        <div className="xl:max-w-xl">
          <CurrencyConverter perEur={fx.perEur} date={fx.date} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="space-y-3 xl:col-span-3">
          <h2 className="font-semibold text-slate-900">{isToday ? "Today's departures" : "Departures"}</h2>
          {departures.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              No departures {isToday ? "today" : "on this day"}.
            </p>
          ) : (
            departures.map((d) => {
              const s = summaryOf.get(d.id);
              const seatsUsed = s?.seats_used ?? 0;
              const st = stopsOf.get(d.id) ?? [];
              const done = st.filter((x) => x.status === "completed" || x.status === "skipped").length;
              const current = st.find((x) => x.status !== "completed" && x.status !== "skipped");
              const crew = driversOf.get(d.id) ?? [];
              const boarded = boardedOf.get(d.id) ?? 0;
              const risk = warnings.get(d.id);
              const ping = lastPingOf.get(d.id);
              const pct = st.length ? Math.round((done / st.length) * 100) : 0;
              return (
                <Link
                  key={d.id}
                  href={`/office/departures/${d.id}`}
                  className="block rounded-xl border border-s-4 border-slate-200 bg-white p-4 hover:bg-slate-50"
                  style={{ borderInlineStartColor: journeyStartColor(d.routes?.name, d.direction) }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">
                        {formatUk(d.depart_at, { time: "short" })}
                        {!isToday || d.depart_at < dayStart ? (
                          <span className="ms-2 text-sm font-normal text-slate-500">
                            {formatUk(d.depart_at, { date: "medium" })}
                          </span>
                        ) : null}
                      </p>
                      <Journey routeName={d.routes?.name} direction={d.direction} />
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[d.status] ?? ""}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-slate-500">Passengers</dt>
                      <dd className="font-medium text-slate-900">
                        {seatsUsed} / {d.seats_released}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Boarded</dt>
                      <dd className="font-medium text-slate-900">{boarded}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-slate-500">Driver</dt>
                      <dd className="font-medium text-slate-900">
                        {crew.length === 0 ? (
                          <span className="text-amber-700">Not assigned</span>
                        ) : (
                          crew
                            .map((c) => `${c.profiles?.display_name ?? "Driver"}${c.vehicles?.registration ? ` · ${c.vehicles.registration}` : ""}`)
                            .join(", ")
                        )}
                      </dd>
                    </div>
                  </dl>

                  {st.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="shrink-0 text-xs text-slate-600">
                          {done} / {st.length} stops
                        </span>
                      </div>
                      {current && d.status !== "completed" && (
                        <p className="mt-1 text-sm text-slate-700">
                          {current.status === "arrived" ? "At " : "Next: "}
                          <span className="font-medium">
                            {current.addresses?.fixed_point_name ?? current.addresses?.line1 ?? "stop"}
                          </span>
                          {current.planned_arrival_at && current.status !== "arrived" && (
                            <span className="text-slate-500"> · planned {formatUk(current.planned_arrival_at, { time: "short" })}</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {st.length === 0 && d.status !== "completed" && (
                    <p className="mt-3 text-sm text-amber-700">No route yet — build it in Dispatch.</p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {d.crossing_checkin_deadline && (
                      <span
                        className={
                          risk?.atRisk ? "font-semibold text-red-700" : risk ? "text-emerald-700" : "text-slate-500"
                        }
                      >
                        Check-in {formatUk(d.crossing_checkin_deadline, { time: "short" })}
                        {risk && (risk.atRisk ? ` · AT RISK, ${-risk.marginMinutes} min late` : ` · ${risk.marginMinutes} min to spare`)}
                      </span>
                    )}
                    {ping && (
                      <span className="text-slate-500">
                        Van seen {formatUk(ping.recordedAt, { time: "short" })}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}

          {(upcoming ?? []).length > 0 && (
            <div className="pt-2">
              <h2 className="mb-2 font-semibold text-slate-900">Coming up</h2>
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {((upcoming ?? []) as unknown as DepartureRow[]).map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/office/departures/${d.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-slate-50"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {formatUk(d.depart_at, { date: "medium", time: "short" })}
                        </span>
                        <Journey routeName={d.routes?.name} direction={d.direction} size="sm" />
                      </span>
                      <span className="text-slate-600">
                        {summaryOf.get(d.id)?.seats_used ?? 0} / {d.seats_released} seats
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="space-y-6 xl:col-span-2">
          {isToday && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">Drivers on the map</h2>
              <LiveDriversMap
                apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
                initialLocations={live.locations}
              />
            </section>
          )}
          <section className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">Needs attention</h2>
            {attention.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">All clear.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {attention.map((a) => (
                  <li key={a.label}>
                    <Link href={a.href} className="flex items-center gap-3 p-4 text-sm hover:bg-slate-50">
                      <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-100 px-2 font-semibold text-amber-800">
                        {a.count}
                      </span>
                      <span className="text-slate-700">{a.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <AddFab href="/office/departures/new" label="New departure" />
    </div>
  );
}
