import { createClient } from "@/lib/supabase/server";
import { upsertTariff } from "@/app/actions/tariffs";
import { createRoute } from "@/app/actions/routes";
import type { DepartureDirection, PassengerCategory } from "@/types/database";

const CATEGORIES: PassengerCategory[] = ["man", "woman", "boy", "girl", "infant"];
const DIRECTIONS: DepartureDirection[] = ["outbound", "return"];

export default async function TariffsPage() {
  const supabase = await createClient();
  const [{ data: routes }, { data: tariffs }] = await Promise.all([
    supabase.from("routes").select("*").order("name"),
    supabase.from("tariffs").select("*").order("created_at", { ascending: false }),
  ]);

  async function addRoute(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    await createRoute({ name, code: String(formData.get("code") ?? "") || null });
  }

  async function addTariff(formData: FormData) {
    "use server";
    const routeId = String(formData.get("route_id") ?? "");
    const baseGbp = Number(formData.get("base_fare_gbp") ?? 0);
    const baseEur = Number(formData.get("base_fare_eur") ?? 0);
    if (!routeId) return;
    const category = String(formData.get("category") ?? "") as PassengerCategory | "";
    const direction = String(formData.get("direction") ?? "") as DepartureDirection | "";
    await upsertTariff({
      route_id: routeId,
      category: category || null,
      direction: direction || null,
      base_fare_gbp: baseGbp,
      base_fare_eur: baseEur,
      luggage_large_allowance: Number(formData.get("luggage_large_allowance") ?? 0),
      luggage_small_allowance: Number(formData.get("luggage_small_allowance") ?? 0),
      luggage_hand_allowance: Number(formData.get("luggage_hand_allowance") ?? 1),
      luggage_additional_charge_gbp: Number(formData.get("luggage_additional_charge_gbp") ?? 0),
      luggage_additional_charge_eur: Number(formData.get("luggage_additional_charge_eur") ?? 0),
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Tariffs</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Routes</h2>
        <form action={addRoute} className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
            <input name="name" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
            <input name="code" className="w-32 rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
            Add route
          </button>
        </form>
        <ul className="text-sm text-slate-600">
          {(routes ?? []).map((r) => (
            <li key={r.id}>
              {r.name} {r.code ? `(${r.code})` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Add tariff row</h2>
        <form action={addTariff} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Route</label>
            <select name="route_id" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              {(routes ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Direction</label>
            <select name="direction" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">All</option>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
            <select name="category" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Base fare £</label>
            <input name="base_fare_gbp" type="number" step="0.01" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Base fare €</label>
            <input name="base_fare_eur" type="number" step="0.01" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Large allowance</label>
            <input name="luggage_large_allowance" type="number" defaultValue={1} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Small allowance</label>
            <input name="luggage_small_allowance" type="number" defaultValue={1} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Extra charge £</label>
            <input name="luggage_additional_charge_gbp" type="number" step="0.01" defaultValue={0} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Extra charge €</label>
            <input name="luggage_additional_charge_eur" type="number" step="0.01" defaultValue={0} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2 flex items-end">
            <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
              Save tariff
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {(tariffs ?? []).map((t) => (
            <li key={t.id} className="p-4 text-sm text-slate-700">
              {t.category ?? "all categories"} · {t.direction ?? "both directions"} — £{t.base_fare_gbp} / €{t.base_fare_eur}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
