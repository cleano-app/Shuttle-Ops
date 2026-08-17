import { listAccountingRates, setAccountingRate } from "@/app/actions/accounting";

export default async function AccountingPage() {
  const { rates } = await listAccountingRates();

  async function addRate(formData: FormData) {
    "use server";
    const gbpPerEur = Number(formData.get("gbp_per_eur") ?? 0);
    const effectiveFrom = String(formData.get("effective_from") ?? "");
    if (!gbpPerEur || !effectiveFrom) return;
    await setAccountingRate({
      gbpPerEur,
      effectiveFrom,
      note: String(formData.get("note") ?? "") || null,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Accounting rate</h1>
        <p className="text-sm text-slate-500">
          Used only to consolidate reporting into one currency — never affects what a passenger is
          charged. Every consolidated report states the rate used.
        </p>
      </div>

      <form action={addRate} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">GBP per EUR</label>
          <input name="gbp_per_eur" type="number" step="0.000001" required className="w-32 rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Effective from</label>
          <input name="effective_from" type="date" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <input name="note" placeholder="Note" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
          Set rate
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {(rates ?? []).map((r) => (
            <li key={r.id} className="p-4 text-sm text-slate-700">
              From {r.effective_from} {r.effective_to ? `to ${r.effective_to}` : "(current)"} — 1 EUR ={" "}
              {r.gbp_per_eur} GBP {r.note && `· ${r.note}`}
            </li>
          ))}
          {(!rates || rates.length === 0) && <li className="p-4 text-sm text-slate-500">No rate set yet.</li>}
        </ul>
      </div>
    </div>
  );
}
