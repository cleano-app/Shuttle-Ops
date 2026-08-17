import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";
import { submitExpense } from "@/app/actions/driverPay";
import { recordCashTransaction } from "@/app/actions/cash";
import { listPayStatementsForDriver } from "@/app/actions/driverPay";
import { getMyAssignments } from "@/app/actions/driver";
import { createClient } from "@/lib/supabase/server";
import type { DriverExpenseType, Currency } from "@/types/database";

const EXPENSE_TYPES: DriverExpenseType[] = ["fuel", "toll", "crossing", "parking", "meal", "other"];

export default async function DriverMePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "driver") redirect("/office/dashboard");

  const supabase = await createClient();
  const [{ data: myExpenses }, { statements }, { assignments }] = await Promise.all([
    supabase.from("driver_expenses").select("*").eq("driver_id", session.userId).order("created_at", { ascending: false }).limit(10),
    listPayStatementsForDriver(session.userId),
    getMyAssignments(),
  ]);

  async function addExpense(formData: FormData) {
    "use server";
    const amount = Number(formData.get("amount") ?? 0);
    if (!amount) return;
    await submitExpense({
      departureId: String(formData.get("departure_id") ?? "") || null,
      type: String(formData.get("type") ?? "other") as DriverExpenseType,
      amount,
      currency: String(formData.get("currency") ?? "GBP") as Currency,
    });
  }

  async function addCash(formData: FormData) {
    "use server";
    const amount = Number(formData.get("amount") ?? 0);
    if (!amount) return;
    await recordCashTransaction({
      departureId: String(formData.get("departure_id") ?? "") || null,
      transactionType: "driver_to_office_handover",
      currency: String(formData.get("currency") ?? "GBP") as Currency,
      amount,
      notes: String(formData.get("notes") ?? "") || null,
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link href="/driver" className="text-sm text-slate-500 hover:underline">
            ← Back
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">Me</h1>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
            Sign out
          </button>
        </form>
      </div>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Log an expense</h2>
        <form action={addExpense} className="space-y-2">
          <select name="departure_id" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Not tied to a departure</option>
            {(assignments ?? []).map((a) => (
              <option key={a.departure_id} value={a.departure_id}>
                {a.route_name} · {a.direction} · {new Date(a.depart_at).toLocaleDateString("en-GB")}
              </option>
            ))}
          </select>
          <select name="type" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            {EXPENSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input name="amount" type="number" step="0.01" placeholder="Amount" required className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
            <select name="currency" className="rounded border border-slate-300 px-2 py-2 text-sm">
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <button type="submit" className="w-full rounded bg-brand-dark py-2 text-sm font-medium text-white">
            Submit expense
          </button>
        </form>
      </section>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Hand in cash</h2>
        <form action={addCash} className="space-y-2">
          <select name="departure_id" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Not tied to a departure</option>
            {(assignments ?? []).map((a) => (
              <option key={a.departure_id} value={a.departure_id}>
                {a.route_name} · {a.direction} · {new Date(a.depart_at).toLocaleDateString("en-GB")}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input name="amount" type="number" step="0.01" placeholder="Amount" required className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
            <select name="currency" className="rounded border border-slate-300 px-2 py-2 text-sm">
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <input name="notes" placeholder="Notes (optional)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded bg-brand-dark py-2 text-sm font-medium text-white">
            Record handover
          </button>
        </form>
      </section>

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Recent expenses</h2>
        <ul className="space-y-1 text-sm text-slate-700">
          {(myExpenses ?? []).map((e) => (
            <li key={e.id}>
              {e.type} — {e.currency === "GBP" ? "£" : "€"}
              {e.amount} {e.approved_at ? "· approved" : "· pending"}
            </li>
          ))}
          {(!myExpenses || myExpenses.length === 0) && <li className="text-slate-500">No expenses logged yet.</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Pay statements</h2>
        <ul className="space-y-1 text-sm text-slate-700">
          {(statements ?? []).map((s) => (
            <li key={s.id}>
              {s.period_start} – {s.period_end}: £{s.total} ({s.status})
            </li>
          ))}
          {(!statements || statements.length === 0) && <li className="text-slate-500">No statements yet.</li>}
        </ul>
      </section>
    </div>
  );
}
