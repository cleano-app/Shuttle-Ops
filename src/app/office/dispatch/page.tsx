import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DispatchListPage() {
  const supabase = await createClient();
  const { data: departures } = await supabase
    .from("departures")
    .select("id, direction, depart_at, status, routes(name)")
    .in("status", ["published", "boarding", "departed"])
    .order("depart_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dispatch</h1>
        <p className="text-sm text-slate-500">
          Operational stops, route templates, and driver/vehicle assignments per departure.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {!departures || departures.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No departures ready for dispatch yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {departures.map((d) => {
              const routeName = (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
              return (
                <li key={d.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-slate-900">
                      {routeName} · {d.direction}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(d.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                      {d.status}
                    </p>
                  </div>
                  <Link
                    href={`/office/dispatch/${d.id}`}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Open board
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
