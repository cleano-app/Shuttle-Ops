import { createClient } from "@/lib/supabase/server";
import { createRoute } from "@/app/actions/routes";
import { setPrice } from "@/app/actions/tariffs";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";
import { PriceGrid, type PriceRow } from "./PriceGrid";

/**
 * Settings → Price list (owner, 1 Oct 2026). Every seat in the Booking
 * Console and on /book is priced from here (pickTariff: passenger type +
 * direction, falling back to the route's standard price). Prices are
 * copied onto each booking when it's made, so changes never alter
 * existing bookings.
 */
export default async function PriceListPage() {
  const supabase = await createClient();
  const [{ data: routes }, { data: tariffs }] = await Promise.all([
    supabase.from("routes").select("id, name, code, active").order("name"),
    supabase.from("tariffs").select("*").eq("active", true).order("created_at", { ascending: true }),
  ]);

  async function addRoute(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Give the route a name, e.g. London ⇄ Antwerp." };
    const res = await createRoute({ name, code: String(formData.get("code") ?? "").trim() || null });
    if (res.error) return res;
    return { success: true, message: "Route added. Set its standard price below." };
  }

  const activeRoutes = (routes ?? []).filter((r) => r.active !== false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Price list</h1>
        <p className="text-sm text-slate-500">
          Fares per journey and passenger type. The Booking Console and online booking price every seat from here.
          Leave a box empty to use the standard price shown in grey. Changes save as you leave a box and never change
          bookings already made.
        </p>
      </div>

      {activeRoutes.map((r) => {
        const rows = ((tariffs ?? []) as unknown as (PriceRow & { route_id: string })[]).filter((t) => t.route_id === r.id);
        return (
          <section key={r.id} className="space-y-3">
            {rows.length === 0 ? (
              <NoPrices routeId={r.id} routeName={r.name} />
            ) : (
              <PriceGrid routeId={r.id} routeName={r.name} rows={rows} />
            )}
          </section>
        );
      })}

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-slate-900">+ Add a route</summary>
        <ActionForm action={addRoute} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Name
            <input name="name" placeholder="London ⇄ Antwerp" className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Code
            <input name="code" placeholder="LON-ANT" className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
            Add route
          </button>
        </ActionForm>
      </details>
    </div>
  );
}

/** A route with no prices yet: one form for its standard £/€ fare. */
function NoPrices({ routeId, routeName }: { routeId: string; routeName: string }) {
  async function setStandard(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const gbp = Number(formData.get("gbp"));
    const eur = Number(formData.get("eur"));
    if (!(gbp >= 0) || !(eur >= 0)) return { error: "Enter both prices." };
    const a = await setPrice({ routeId, direction: null, category: null, currency: "GBP", amount: gbp });
    if (a.error) return a;
    return setPrice({ routeId, direction: null, category: null, currency: "EUR", amount: eur });
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-4">
      <p className="mb-2 font-semibold text-slate-900">{routeName}</p>
      <p className="mb-3 text-sm text-amber-800">No prices yet — set the standard fare to start.</p>
      <ActionForm action={setStandard} className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-700">
          £
          <input name="gbp" inputMode="decimal" className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-slate-700">
          €
          <input name="eur" inputMode="decimal" className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
          Save
        </button>
      </ActionForm>
    </div>
  );
}
