import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createDeparture } from "@/app/actions/departures";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";
import { ukLocalToIso } from "@/lib/time";
import { journeyLabel } from "@/lib/journey";
import type { DepartureDirection } from "@/types/database";

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "block text-sm font-medium text-slate-700";

/** New departure on its own page — reached from the phone "+" and the
 * desktop "New departure" button. Opens the departure once created. */
export default async function NewDeparturePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // From the calendar's "+ New departure on this day".
  const { date } = await searchParams;
  const defaultDepart = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T07:00` : undefined;
  const supabase = await createClient();
  const { data: routes } = await supabase.from("routes").select("id, name").eq("active", true).order("name");

  async function addDeparture(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const [routeId = "", direction = "outbound"] = String(formData.get("journey") ?? "").split("|");
    const departAt = ukLocalToIso(String(formData.get("depart_at") ?? ""));
    const seatsCapacity = Number(formData.get("seats_capacity") ?? 0);
    if (!routeId || !departAt || !seatsCapacity) return { error: "Journey, time and seats are required." };
    const releaseNow = formData.get("release_all") === "on";
    const limit = String(formData.get("crossing_passenger_limit") ?? "").trim();
    const result = await createDeparture({
      route_id: routeId,
      direction: direction as DepartureDirection,
      depart_at: departAt,
      seats_capacity: seatsCapacity,
      hold_capacity_units: Number(formData.get("hold_capacity_units") ?? 0),
      wheelchair_capacity: Number(formData.get("wheelchair_capacity") ?? 0),
      crossing_reference: String(formData.get("crossing_reference") ?? "").trim() || null,
      crossing_passenger_limit: limit ? Number(limit) : null,
      crossing_checkin_deadline: ukLocalToIso(String(formData.get("crossing_checkin_deadline") ?? "")),
      ...(releaseNow ? { seats_released: seatsCapacity } : {}),
    });
    if (result.error || !result.id) return { error: result.error ?? "Could not create the departure." };
    redirect(`/office/departures/${result.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/office/departures" className="text-sm text-slate-500 hover:underline">
          ← Departures
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">New departure</h1>
        <p className="text-sm text-slate-500">Created as a draft. Publish it from its page when it&apos;s ready.</p>
      </div>

      <ActionForm
        action={addDeparture}
        className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-4"
      >
        <label className={`${label} col-span-2`}>
          Journey
          <select name="journey" required className={input}>
            {(routes ?? []).flatMap((r) =>
              (["outbound", "return"] as const).map((dir) => (
                <option key={`${r.id}|${dir}`} value={`${r.id}|${dir}`}>
                  {journeyLabel(r.name, dir)}
                </option>
              ))
            )}
          </select>
        </label>
        <label className={`${label} col-span-2`}>
          Departs (UK time)
          <input name="depart_at" type="datetime-local" required defaultValue={defaultDepart} className={input} />
        </label>
        <label className={label}>
          Seats
          <input name="seats_capacity" type="number" min={1} required defaultValue={16} className={input} />
        </label>
        <label className={label}>
          Hold units
          <input name="hold_capacity_units" type="number" min={0} defaultValue={26} className={input} />
        </label>
        <label className={label}>
          Wheelchair spaces
          <input name="wheelchair_capacity" type="number" min={0} defaultValue={1} className={input} />
        </label>
        <label className={label}>
          Crossing limit
          <input name="crossing_passenger_limit" type="number" min={0} className={input} />
        </label>
        <label className={`${label} col-span-2`}>
          Crossing reference
          <input name="crossing_reference" className={input} />
        </label>
        <label className={`${label} col-span-2`}>
          Crossing check-in deadline
          <input name="crossing_checkin_deadline" type="datetime-local" className={input} />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 lg:col-span-4">
          <input name="release_all" type="checkbox" defaultChecked className="h-4 w-4" />
          Release all seats for booking now
        </label>
        <div className="col-span-2 flex justify-end lg:col-span-4">
          <button type="submit" className="rounded-lg bg-brand-dark px-5 py-2.5 text-sm font-medium text-white">
            Create departure
          </button>
        </div>
      </ActionForm>
    </div>
  );
}
