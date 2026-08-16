import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";

// Driver features (route screen, duty log, handovers, vehicle checks) are
// Phase 2/3 per build spec §39 — this placeholder exists purely so a
// driver login doesn't dead-end at a 404, matching the Phase 1 plan.
export default async function DriverHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "driver") redirect("/office/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Shuttle Ops</h1>
      <p className="max-w-sm text-slate-600">
        Driver features — your route, stops and duty log — arrive in a later phase. Check
        with the office for today&apos;s plan.
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
