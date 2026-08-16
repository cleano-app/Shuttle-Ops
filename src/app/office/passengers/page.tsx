import { createClient } from "@/lib/supabase/server";

export default async function PassengersPage() {
  const supabase = await createClient();
  const { data: passengers } = await supabase
    .from("passengers")
    .select("id, full_name, phone, category, no_show_count, late_cancel_count, deposit_waiver_standing")
    .order("full_name")
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Passengers</h1>
        <p className="text-sm text-slate-500">
          Use the Booking Console to search and add passengers. This is a read-only list of the
          most recent 50.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {(passengers ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-slate-900">{p.full_name}</p>
                <p className="text-sm text-slate-500">
                  {p.category} · {p.phone ?? "no phone"}
                </p>
              </div>
              <div className="text-right text-sm text-slate-500">
                {p.deposit_waiver_standing && (
                  <p className="text-amber-700">Standing waiver</p>
                )}
                <p>
                  No-shows {p.no_show_count} · Late cancels {p.late_cancel_count}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
