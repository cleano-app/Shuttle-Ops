import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getMyAssignments } from "@/app/actions/driver";
import { AssignmentResponse } from "@/components/driver/AssignmentResponse";
import { formatUk, isoHoursFromNow } from "@/lib/time";

// Build spec §31: driver sees only their assigned vehicle, departure and
// segment. With exactly one accepted run, skip straight to the route
// screen; a run still waiting for Accept stays on this list so the driver
// confirms it first (the route screen has the same Accept banner too).
export default async function DriverHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "driver") redirect("/office/dashboard");

  const { assignments: all, error } = await getMyAssignments();
  // Runs whose departure was more than a day ago drop off the list, even if
  // the office has not marked them completed yet.
  const cutoff = isoHoursFromNow(-24);
  const assignments = all.filter((a) => new Date(a.depart_at) >= new Date(cutoff));

  if (!error && assignments.length === 1 && assignments[0].assignment_status === "accepted") {
    redirect(`/driver/${assignments[0].departure_id}`);
  }

  return (
    <div className="p-4">
      {error ? (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Couldn&apos;t load your runs: {error}
        </div>
      ) : assignments.length === 0 ? (
        <div className="mt-8 text-center text-slate-600">
          <p className="text-lg font-medium">No assignments yet.</p>
          <p className="mt-2 text-sm">Check with the office for today&apos;s plan.</p>
        </div>
      ) : (
        <>
          <h1 className="mb-3 text-lg font-semibold text-slate-900">Your runs</h1>
          <ul className="space-y-3">
            {assignments.map((a) => {
              const segment =
                a.from_stop_sequence == null && a.to_stop_sequence == null
                  ? null
                  : "Your part of the route only";
              return (
                <li key={a.assignment_id} className="rounded-lg border border-hairline bg-white p-4 shadow-sm">
                  <Link href={`/driver/${a.departure_id}`} className="block">
                    <p className="font-semibold text-slate-900">
                      {a.route_name} · {a.direction}
                    </p>
                    <p className="text-sm text-slate-600">{formatUk(a.depart_at, { date: "medium", time: "short" })}</p>
                    <p className="text-sm text-muted">
                      Vehicle {a.vehicle_registration}
                      {segment ? ` · ${segment}` : ""}
                    </p>
                    <p className="mt-1 text-sm font-medium text-brand-dark">Open route →</p>
                  </Link>
                  {a.assignment_status === "assigned" && (
                    <div className="mt-3 border-t border-hairline pt-3">
                      <AssignmentResponse assignmentId={a.assignment_id} compact />
                    </div>
                  )}
                  {a.assignment_status === "accepted" && <p className="mt-2 text-xs text-green">✓ Accepted</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
