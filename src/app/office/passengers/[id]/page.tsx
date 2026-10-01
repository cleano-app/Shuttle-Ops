import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { updatePassenger, updateVulnerabilityNotes } from "@/app/actions/passengers";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";
import { formatUk } from "@/lib/time";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { PassengerCategory } from "@/types/database";
import { Journey } from "@/components/Journey";

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "block text-sm font-medium text-slate-700";
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

export default async function PassengerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const canSeeVulnerability = session?.role === "admin" || session?.role === "office";
  const supabase = await createClient();

  const [{ data: p }, { data: trips }] = await Promise.all([
    supabase.from("passengers").select("*").eq("id", id).single(),
    supabase
      .from("booking_passengers")
      .select("id, status, category, bookings!inner(reference, departures(id, depart_at, direction, routes(name)))")
      .eq("passenger_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (!p) notFound();

  async function save(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const fullName = text(formData, "full_name");
    if (!fullName) return { error: "Name is required." };
    const age = text(formData, "age");
    const result = await updatePassenger(id, {
      full_name: fullName,
      phone: text(formData, "phone"),
      email: text(formData, "email"),
      preferred_language: text(formData, "preferred_language"),
      category: String(formData.get("category")) as PassengerCategory,
      date_of_birth: text(formData, "date_of_birth"),
      age: age ? Number(age) : null,
      mobility_needs: text(formData, "mobility_needs"),
      emergency_contact_name: text(formData, "emergency_contact_name"),
      emergency_contact_phone: text(formData, "emergency_contact_phone"),
      deposit_waiver_standing: formData.get("deposit_waiver_standing") === "on",
    });
    return result.error ? result : { success: true, message: "Saved." };
  }

  async function saveVulnerability(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    const result = await updateVulnerabilityNotes(
      id,
      text(formData, "vulnerability_notes"),
      formData.get("is_vulnerable") === "on"
    );
    return result.error ? result : { success: true, message: "Saved." };
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/office/passengers" className="text-sm text-slate-500 hover:underline">
          ← Passengers
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{p.full_name}</h1>
        <p className="text-sm text-slate-500">
          {p.no_show_count} no-shows · {p.late_cancel_count} late cancels · added {formatUk(p.created_at, { date: "medium" })}
          {p.created_via ? ` via ${p.created_via}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
          <ActionForm action={save} className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Full name
              <input name="full_name" defaultValue={p.full_name} required className={input} />
            </label>
            <label className={label}>
              Category
              <select name="category" defaultValue={p.category} className={input}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Phone
              <input name="phone" type="tel" defaultValue={p.phone ?? ""} className={input} />
            </label>
            <label className={label}>
              Email
              <input name="email" type="email" defaultValue={p.email ?? ""} className={input} />
            </label>
            <label className={label}>
              Preferred language
              <select name="preferred_language" defaultValue={p.preferred_language ?? "en"} className={input}>
                <option value="en">English</option>
                <option value="yi">Yiddish</option>
                <option value="he">Hebrew</option>
                <option value="nl">Dutch</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Date of birth
                <input name="date_of_birth" type="date" defaultValue={p.date_of_birth ?? ""} className={input} />
              </label>
              <label className={label}>
                Age
                <input name="age" type="number" min={0} defaultValue={p.age ?? ""} className={input} />
              </label>
            </div>
            <label className={`${label} sm:col-span-2`}>
              Mobility needs
              <input name="mobility_needs" defaultValue={p.mobility_needs ?? ""} className={input} />
            </label>
            <label className={label}>
              Emergency contact
              <input name="emergency_contact_name" defaultValue={p.emergency_contact_name ?? ""} className={input} />
            </label>
            <label className={label}>
              Emergency phone
              <input
                name="emergency_contact_phone"
                type="tel"
                defaultValue={p.emergency_contact_phone ?? ""}
                className={input}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                name="deposit_waiver_standing"
                type="checkbox"
                defaultChecked={p.deposit_waiver_standing}
                className="h-4 w-4"
              />
              Standing deposit waiver — applied automatically to every booking
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
                Save
              </button>
            </div>
          </ActionForm>
        </section>

        <div className="space-y-6">
          {canSeeVulnerability && (
            <section className="rounded-xl border border-amber-200 bg-white p-4">
              <h2 className="mb-1 font-semibold text-slate-900">Vulnerability</h2>
              <p className="mb-3 text-xs text-slate-500">Office and admin only. Never shown to drivers or exported.</p>
              <ActionForm action={saveVulnerability} className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input name="is_vulnerable" type="checkbox" defaultChecked={p.is_vulnerable} className="h-4 w-4" />
                  Vulnerable passenger
                </label>
                <textarea
                  name="vulnerability_notes"
                  rows={4}
                  defaultValue={p.vulnerability_notes ?? ""}
                  className={input}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Save notes
                </button>
              </ActionForm>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">Trips</h2>
            {(trips ?? []).length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No trips yet.</p>
            ) : (
              <ul className="divide-y divide-slate-200 text-sm">
                {(trips ?? []).map((t) => {
                  const b = (t as unknown as {
                    bookings?: {
                      reference?: string;
                      departures?: { id: string; depart_at: string; direction: string; routes?: { name?: string } };
                    };
                  }).bookings;
                  const d = b?.departures;
                  return (
                    <li key={t.id}>
                      <Link
                        href={d ? `/office/departures/${d.id}` : "#"}
                        className="flex justify-between gap-2 p-3 hover:bg-slate-50"
                      >
                        <span>
                          {d ? formatUk(d.depart_at, { date: "medium", time: "short" }) : "—"}
                          {d && <> · <Journey routeName={d.routes?.name} direction={d.direction} size="sm" /></>}
                        </span>
                        <span className="text-slate-500">{t.status.replace("_", " ")}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
