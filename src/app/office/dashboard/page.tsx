import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function OfficeDashboardPage() {
  const supabase = await createClient();
  const { data: departures } = await supabase
    .from("departures")
    .select("id, direction, depart_at, status, seats_capacity, seats_released, routes(name)")
    .in("status", ["draft", "published", "boarding"])
    .order("depart_at", { ascending: true })
    .limit(10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Upcoming departures still open for booking.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {!departures || departures.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No upcoming departures yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {departures.map((d) => {
              const routeName =
                (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
              return (
                <li key={d.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-slate-900">
                      {routeName} · {d.direction}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(d.depart_at).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      · {d.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">
                      {d.seats_released} / {d.seats_capacity} released
                    </span>
                    <Link
                      href={`/office/departures/${d.id}`}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Link
        href="/office/booking-console"
        className="inline-block rounded bg-brand-dark px-4 py-2 font-medium text-white"
      >
        Open Booking Console
      </Link>
    </div>
  );
}
