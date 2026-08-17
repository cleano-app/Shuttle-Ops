import { createClient } from "@/lib/supabase/server";
import { generatePayStatement, approvePayStatement, approveExpense, listPendingExpenses } from "@/app/actions/driverPay";
import type { DriverPayType } from "@/types/database";

const PAY_TYPES: DriverPayType[] = ["hourly", "per_trip", "per_day"];

export default async function DriverPayPage() {
  const supabase = await createClient();
  const { data: drivers } = await supabase
    .from("profiles")
    .select("id, display_name, pay_type, pay_rate")
    .eq("role", "driver")
    .order("display_name");

  const { data: statements } = await supabase
    .from("driver_pay_statements")
    .select("*, profiles!driver_pay_statements_driver_id_fkey(display_name)")
    .order("generated_at", { ascending: false })
    .limit(20);

  const { expenses } = await listPendingExpenses();

  async function setDriverPayRate(formData: FormData) {
    "use server";
    const driverId = String(formData.get("driver_id"));
    const payType = String(formData.get("pay_type") ?? "") as DriverPayType;
    const payRate = Number(formData.get("pay_rate") ?? 0);
    const supabase = await createClient();
    await supabase.from("profiles").update({ pay_type: payType, pay_rate: payRate }).eq("id", driverId);
  }

  async function generate(formData: FormData) {
    "use server";
    const driverId = String(formData.get("driver_id"));
    const periodStart = String(formData.get("period_start"));
    const periodEnd = String(formData.get("period_end"));
    if (!driverId || !periodStart || !periodEnd) return;
    await generatePayStatement({ driverId, periodStart, periodEnd });
  }

  async function approve(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    await approvePayStatement({ id });
  }

  async function approveExpenseAction(formData: FormData) {
    "use server";
    await approveExpense(String(formData.get("expense_id")));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Driver Pay</h1>
        <p className="text-sm text-slate-500">
          Statement, not invoice. The suggested amount comes from recorded duty data — Office approves the
          final figure.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Driver pay rates</h2>
        <ul className="space-y-2">
          {(drivers ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-end gap-3 rounded border border-slate-200 p-2">
              <span className="min-w-[120px] font-medium text-slate-800">{d.display_name}</span>
              <form action={setDriverPayRate} className="flex items-end gap-2">
                <input type="hidden" name="driver_id" value={d.id} />
                <select name="pay_type" defaultValue={d.pay_type ?? ""} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Not set</option>
                  {PAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  name="pay_rate"
                  type="number"
                  step="0.01"
                  defaultValue={d.pay_rate ?? ""}
                  placeholder="Rate £"
                  className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  Save
                </button>
              </form>
              <form action={generate} className="flex items-end gap-2">
                <input type="hidden" name="driver_id" value={d.id} />
                <input name="period_start" type="date" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <input name="period_end" type="date" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <button type="submit" className="rounded bg-brand-dark px-3 py-1.5 text-sm font-medium text-white">
                  Generate statement
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Pending expenses</h2>
        <ul className="space-y-2 text-sm">
          {(expenses ?? []).map((e) => {
            const driverName = (e as unknown as { profiles?: { display_name?: string } }).profiles?.display_name;
            return (
              <li key={e.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
                <span>
                  {driverName ?? "Driver"} — {e.type} — {e.currency === "GBP" ? "£" : "€"}
                  {e.amount}
                </span>
                <form action={approveExpenseAction}>
                  <input type="hidden" name="expense_id" value={e.id} />
                  <button type="submit" className="text-sm text-brand-dark underline">
                    Approve
                  </button>
                </form>
              </li>
            );
          })}
          {(!expenses || expenses.length === 0) && <li className="text-slate-500">No expenses awaiting approval.</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="p-4 pb-0 font-medium text-slate-900">Recent statements</h2>
        <ul className="divide-y divide-slate-200">
          {(statements ?? []).map((s) => {
            const driverName = (s as unknown as { profiles?: { display_name?: string } }).profiles?.display_name;
            return (
              <li key={s.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-slate-900">
                    {driverName ?? "Driver"} — {s.period_start} to {s.period_end}
                  </p>
                  <p className="text-sm text-slate-500">
                    {s.total_hours}h · {s.total_trips} trips · Total £{s.total} · {s.status}
                  </p>
                </div>
                {s.status === "draft" && (
                  <form action={approve}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Approve
                    </button>
                  </form>
                )}
              </li>
            );
          })}
          {(!statements || statements.length === 0) && <li className="p-4 text-sm text-slate-500">No statements yet.</li>}
        </ul>
      </section>
    </div>
  );
}
