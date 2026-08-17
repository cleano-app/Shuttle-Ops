import { getSubsidySummary } from "@/app/actions/reconciliation";
import { getCallLogSummary } from "@/app/actions/callLogs";
import { recomputeLegTimings } from "@/app/actions/legTimings";

export default async function ReportsPage() {
  const [subsidy, callSummary] = await Promise.all([getSubsidySummary(30), getCallLogSummary(30)]);

  async function recompute() {
    "use server";
    await recomputeLegTimings();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Standing figures trustees and grant applications ask for.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Subsidy — last 30 days</h2>
        {"error" in subsidy ? (
          <p className="text-sm text-red-600">{subsidy.error}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-slate-500">Beneficiaries</p>
              <p className="text-lg font-semibold text-slate-900">{subsidy.distinctBeneficiaries}</p>
            </div>
            <div>
              <p className="text-slate-500">Trips</p>
              <p className="text-lg font-semibold text-slate-900">{subsidy.tripsCount}</p>
            </div>
            <div>
              <p className="text-slate-500">Subsidy delivered</p>
              <p className="text-lg font-semibold text-slate-900">£{subsidy.totalSubsidy}</p>
            </div>
            <div>
              <p className="text-slate-500">Notional value delivered</p>
              <p className="text-lg font-semibold text-slate-900">£{subsidy.totalNotionalValue}</p>
            </div>
            <div>
              <p className="text-slate-500">Contributions</p>
              <p className="text-lg font-semibold text-slate-900">£{subsidy.totalContribution}</p>
            </div>
            <div>
              <p className="text-slate-500">Cost recovery</p>
              <p className="text-lg font-semibold text-slate-900">{subsidy.costRecoveryPct}%</p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Call outcomes — last 30 days</h2>
        {"error" in callSummary ? (
          <p className="text-sm text-red-600">{callSummary.error}</p>
        ) : Object.keys(callSummary.byOutcome).length === 0 ? (
          <p className="text-sm text-slate-500">No calls logged yet.</p>
        ) : (
          <ul className="text-sm text-slate-700">
            {Object.entries(callSummary.byOutcome).map(([outcome, count]) => (
              <li key={outcome} className={outcome === "no_capacity" || outcome === "abandoned_at_menu" ? "font-semibold text-amber-700" : ""}>
                {outcome}: {count}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          &quot;no_capacity&quot; and &quot;abandoned_at_menu&quot; are the two most valuable metrics here —
          unmet demand and whether the line works for this passenger base.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Historical ETA data</h2>
        <p className="mb-3 text-sm text-slate-500">
          No live traffic — recomputed from this shuttle&apos;s own completed journeys. No automatic nightly
          job exists yet; run it manually here.
        </p>
        <form action={recompute}>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Recompute leg timings
          </button>
        </form>
      </section>
    </div>
  );
}
