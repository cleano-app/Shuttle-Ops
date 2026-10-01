import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PassengersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim();
  const supabase = await createClient();
  let query = supabase
    .from("passengers")
    .select("id, full_name, phone, category, no_show_count, late_cancel_count, deposit_waiver_standing, is_vulnerable")
    .order("full_name")
    .limit(100);
  if (term) {
    const like = `%${term.replace(/[%,()]/g, " ")}%`;
    query = query.or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
  }
  const { data: passengers, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Passengers</h1>
          <p className="text-sm text-slate-500">New passengers are added from the Booking Console while on the call.</p>
        </div>
        <form className="flex w-full gap-2 sm:w-auto">
          <input
            name="q"
            defaultValue={term}
            placeholder="Name, phone or email"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-64"
          />
          <button type="submit" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
            Search
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-red-700">{error.message}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {(passengers ?? []).length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{term ? "No passengers match." : "No passengers yet."}</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {(passengers ?? []).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/office/passengers/${p.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{p.full_name}</p>
                    <p className="text-sm text-slate-500">
                      {p.category} · {p.phone ?? "no phone"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {p.deposit_waiver_standing && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 ring-1 ring-amber-200">
                        Standing waiver
                      </span>
                    )}
                    {p.is_vulnerable && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 ring-1 ring-slate-200">
                        Vulnerable
                      </span>
                    )}
                    {(p.no_show_count > 0 || p.late_cancel_count > 0) && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700 ring-1 ring-red-200">
                        {p.no_show_count} no-show · {p.late_cancel_count} late cancel
                      </span>
                    )}
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
