import { listUndecidedCancellations, decideCancellation } from "@/app/actions/cancellations";
import type { CancellationDepositAction, CancellationFareAction } from "@/types/database";

export default async function CancellationsPage() {
  const { cancellations } = await listUndecidedCancellations();

  async function decide(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const note = String(formData.get("decision_note") ?? "").trim();
    if (!note) return;
    await decideCancellation({
      id,
      decidedOutcome: String(formData.get("decided_outcome") ?? "office_decision"),
      depositAction: String(formData.get("deposit_action") ?? "retain") as CancellationDepositAction,
      fareAction: String(formData.get("fare_action") ?? "no_charge") as CancellationFareAction,
      decisionNote: note,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Cancellations</h1>
        <p className="text-sm text-slate-500">
          The system suggests an outcome from the notice given — Office always decides. Nothing here
          executes automatically.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {!cancellations || cancellations.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No cancellations awaiting a decision.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {cancellations.map((c) => {
              const bookingRef = (c as unknown as { bookings?: { reference?: string } }).bookings?.reference;
              return (
                <li key={c.id} className="p-4">
                  <p className="font-medium text-slate-900">
                    Booking {bookingRef ?? c.booking_id} — {c.reason_text ?? c.reason_code ?? "No reason given"}
                  </p>
                  <p className="mb-3 text-sm text-slate-500">
                    Notice: {c.notice_hours != null ? `${c.notice_hours}h` : "unknown"} · Suggested:{" "}
                    <span className="font-medium">{c.suggested_outcome}</span>
                  </p>
                  <form action={decide} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={c.id} />
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Deposit</label>
                      <select name="deposit_action" className="rounded border border-slate-300 px-2 py-2 text-sm">
                        <option value="release">Release</option>
                        <option value="retain">Retain</option>
                        <option value="waive">Waive</option>
                        <option value="no_deposit">No deposit</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Fare</label>
                      <select name="fare_action" className="rounded border border-slate-300 px-2 py-2 text-sm">
                        <option value="no_charge">No charge</option>
                        <option value="refund">Refund</option>
                        <option value="charge">Charge</option>
                      </select>
                    </div>
                    <input
                      name="decision_note"
                      placeholder="Decision note (required)"
                      required
                      className="min-w-[200px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
                      Decide
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
