import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatUk } from "@/lib/time";
import { AddFab } from "@/components/shell/AddFab";
import { JourneyBadge } from "@/components/JourneyBadge";
import { journeyStartColor } from "@/components/Journey";

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

  const [{ data: departures }, { data: summaries }] = await Promise.all([
    query,
    supabase.from("departure_capacity_summary").select("departure_id, seats_used"),
  ]);
  const used = new Map((summaries ?? []).map((s) => [s.departure_id, s.seats_used ?? 0]));

  const rows = (departures ?? []) as unknown as DepartureRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Departures</h1>
        <div className="flex items-center gap-2">
        <Link
          href="/office/departures/new"
          className="hidden rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white md:inline-block"
        >
          + New departure
        </Link>
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
      </div>
      <AddFab href="/office/departures/new" label="New departure" />


      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {showPast ? "No past departures." : "No upcoming departures yet. Tap + to create one."}
        </p>
      ) : (
        // Grouped by UK calendar day (owner, 1 Oct 2026).
        groupByDay(rows).map(([dayLabel, dayRows]) => (
          <section key={dayLabel}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{dayLabel}</h2>
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {dayRows.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/office/departures/${d.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 border-s-4 p-4 hover:bg-slate-50"
                    style={{ borderInlineStartColor: journeyStartColor(d.routes?.name, d.direction) }}
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-lg font-semibold text-slate-900">{formatUk(d.depart_at, { time: "short" })}</span>
                      <JourneyBadge routeName={d.routes?.name} direction={d.direction} />
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-600">
                        {used.get(d.id) ?? 0} booked / {d.seats_released}
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
          </section>
        ))
      )}
    </div>
  );
}

/** [["Friday 2 October", rows…], …] in list order, by UK calendar day. */
function groupByDay(rows: DepartureRow[]): [string, DepartureRow[]][] {
  const groups = new Map<string, DepartureRow[]>();
  for (const d of rows) {
    const label = new Date(d.depart_at).toLocaleDateString("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    groups.set(label, [...(groups.get(label) ?? []), d]);
  }
  return [...groups.entries()];
}
