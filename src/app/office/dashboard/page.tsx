import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { formatUk, isoHoursFromNow } from "@/lib/time";
import { journeyLabel, journeyTone } from "@/lib/journey";

type DepartureRow = {
  id: string;
  direction: string;
  depart_at: string;
  status: string;
  seats_released: number;
  crossing_checkin_deadline: string | null;
  routes?: { name?: string } | null;
};

export default async function OfficeDashboardPage() {
  const session = await getSession();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [
    { data: departures },
    { data: summaries },
    { count: awaitingConfirmation },
    { count: openFleetTasks },
    { count: undecidedCancellations },
    { count: unreconciledCash },
  ] = await Promise.all([
    supabase
      .from("departures")
      .select("id, direction, depart_at, status, seats_released, crossing_checkin_deadline, routes(name)")
      .in("status", ["draft", "published", "boarding", "departed"])
      .gte("depart_at", isoHoursFromNow(-12))
      .order("depart_at", { ascending: true })
      .limit(8),
    supabase.from("departure_capacity_summary").select("departure_id, seats_used"),
    supabase
      .from("booking_passengers")
      .select("id, bookings!inner(departure_id, departures!inner(depart_at))", { count: "exact", head: true })
      .in("status", ["provisional", "deposit_pending"])
      .gte("bookings.departures.depart_at", nowIso),
    supabase.from("fleet_tasks").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("cancellations").select("id", { count: "exact", head: true }).is("decided_outcome", null),
    supabase.from("cash_transactions").select("id", { count: "exact", head: true }).is("reconciled_at", null),
  ]);

  const used = new Map((summaries ?? []).map((s) => [s.departure_id, s]));
  const rows = (departures ?? []) as unknown as DepartureRow[];
  const firstName = session?.displayName?.split(" ")[0];

  const attention = [
    { count: awaitingConfirmation ?? 0, label: "passengers awaiting deposit or confirmation", href: "/office/departures" },
    { count: undecidedCancellations ?? 0, label: "cancellation requests to decide", href: "/office/cancellations" },
    { count: unreconciledCash ?? 0, label: "cash entries to reconcile", href: "/office/departures?show=past" },
    { count: openFleetTasks ?? 0, label: "open fleet tasks", href: "/office/fleet" },
  ].filter((a) => a.count > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {firstName ? `Hello, ${firstName}` : "Dashboard"}
          </h1>
          <p className="text-sm text-slate-500">{formatUk(new Date(), { date: "full" })}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/office/booking-console" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
            Book a passenger
          </Link>
          <Link
            href="/office/departures"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            New departure
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">Next departures</h2>
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No upcoming departures.{" "}
              <Link href="/office/departures" className="font-medium text-brand-dark underline">
                Create one
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {rows.map((d) => {
                const s = used.get(d.id);
                const seatsUsed = s?.seats_used ?? 0;
                const pct = d.seats_released ? Math.min(100, Math.round((seatsUsed / d.seats_released) * 100)) : 0;
                return (
                  <li key={d.id}>
                    <Link href={`/office/departures/${d.id}`} className="block p-4 hover:bg-slate-50">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-slate-900">
                          {formatUk(d.depart_at, { date: "medium", time: "short" })}
                          <span className="font-normal text-slate-500">
                            {" "}
                            · <span className={journeyTone(d.direction).text}>{journeyLabel(d.routes?.name, d.direction)}</span>
                          </span>
                        </p>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{d.status}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-dark" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="shrink-0 text-sm text-slate-600">
                          {seatsUsed} / {d.seats_released} seats
                        </span>
                      </div>
                      {d.crossing_checkin_deadline && (
                        <p className="mt-1 text-xs text-slate-500">
                          Crossing check-in {formatUk(d.crossing_checkin_deadline, { time: "short" })}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

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
  );
}
