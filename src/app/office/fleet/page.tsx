import Link from "next/link";
import { checkDocumentExpiryReminders, listOpenFleetTasks, resolveFleetTask } from "@/app/actions/fleet";

export default async function FleetDashboardPage() {
  // Lazy sweep — same pattern as the stale-provisional-booking expiry and
  // the Phase 2 dispatch page's own lazy checks. No cron exists yet
  // (build spec §39's nightly job is Phase 4), so opening this page is
  // what actually creates document-expiry reminder tasks.
  await checkDocumentExpiryReminders();

  const { tasks } = await listOpenFleetTasks();

  async function resolve(formData: FormData) {
    "use server";
    await resolveFleetTask(String(formData.get("task_id")));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Fleet</h1>
        <p className="text-sm text-slate-500">Open tasks across the fleet — document expiries and defects.</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {!tasks || tasks.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No open fleet tasks. Everything&apos;s in order.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {tasks.map((t) => {
              const vehicleReg = (t as unknown as { vehicles?: { registration?: string } }).vehicles?.registration;
              return (
                <li key={t.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-slate-900">
                      {t.title} — {vehicleReg ?? "Vehicle"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {t.description} {t.due_date ? `· due ${t.due_date}` : ""}
                    </p>
                  </div>
                  <form action={resolve}>
                    <input type="hidden" name="task_id" value={t.id} />
                    <button
                      type="submit"
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Resolve
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Link href="/office/vehicles" className="inline-block text-sm font-medium text-brand-dark underline">
        Manage vehicles →
      </Link>
    </div>
  );
}
