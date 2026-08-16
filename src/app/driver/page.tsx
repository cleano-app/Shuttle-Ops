import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { getMyAssignments } from "@/app/actions/driver";

// Build spec §31: driver sees only their assigned vehicle, departure and
// segment. If there's exactly one active assignment, skip straight to the
// route screen - no dashboard, no menu, matching "no page transitions"
// (§31's own framing, and the driver never needs to pick between things
// they can't otherwise see).
export default async function DriverHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "driver") redirect("/office/dashboard");

  const { assignments, error } = await getMyAssignments();

  if (!error && assignments.length === 1) {
    redirect(`/driver/${assignments[0].departure_id}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white p-4">
        <span className="text-lg font-semibold text-slate-900">Shuttle Ops</span>
        <form action={logout}>
          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
            Sign out
          </button>
        </form>
      </header>

      <div className="flex-1 p-4">
        {assignments.length === 0 ? (
          <div className="mt-8 text-center text-slate-600">
            <p className="text-lg font-medium">No assignments yet.</p>
            <p className="mt-2 text-sm">Check with the office for today&apos;s plan.</p>
          </div>
        ) : (
          <>
            <h1 className="mb-3 text-lg font-semibold text-slate-900">Your departures</h1>
            <ul className="space-y-2">
              {assignments.map((a) => (
                <li key={a.assignment_id}>
                  <Link
                    href={`/driver/${a.departure_id}`}
                    className="block rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
                  >
                    <p className="font-semibold text-slate-900">
                      {a.route_name} · {a.direction}
                    </p>
                    <p className="text-sm text-slate-600">
                      {new Date(a.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    <p className="text-sm text-slate-500">
                      Vehicle {a.vehicle_registration} · {a.assignment_status}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
