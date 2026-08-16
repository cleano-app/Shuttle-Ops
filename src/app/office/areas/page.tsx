import { createClient } from "@/lib/supabase/server";
import { createArea, setAreaActive } from "@/app/actions/areas";

export default async function AreasPage() {
  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("*")
    .order("running_order", { ascending: true });

  async function addArea(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const country = String(formData.get("country") ?? "").trim();
    if (!name || !country) return;
    await createArea({ name, country });
  }

  async function toggleActive(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const active = formData.get("active") === "true";
    await setAreaActive(id, !active);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Areas</h1>

      <form action={addArea} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input name="name" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
          <input name="country" required placeholder="GB" className="w-24 rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
          Add area
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-200">
          {(areas ?? []).map((area) => (
            <li key={area.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-slate-900">{area.name}</p>
                <p className="text-sm text-slate-500">{area.country} · order {area.running_order}</p>
              </div>
              <form action={toggleActive}>
                <input type="hidden" name="id" value={area.id} />
                <input type="hidden" name="active" value={String(area.active)} />
                <button
                  type="submit"
                  className={`rounded border px-3 py-1.5 text-sm font-medium ${
                    area.active
                      ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                      : "border-amber-300 text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  {area.active ? "Deactivate" : "Activate"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
