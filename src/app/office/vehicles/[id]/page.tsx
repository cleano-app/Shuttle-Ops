import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  addVehicleDocument,
  reportDefect,
  resolveDefect,
  scheduleMaintenance,
  completeMaintenance,
} from "@/app/actions/fleet";
import type { DefectSeverity, VehicleDocType } from "@/types/database";

const DOC_TYPES: VehicleDocType[] = ["mot", "insurance", "service", "safety_inspection", "tachograph", "other"];
const SEVERITIES: DefectSeverity[] = ["minor", "major", "critical"];

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vehicle } = await supabase.from("vehicles").select("*").eq("id", id).single();
  if (!vehicle) notFound();

  const [{ data: documents }, { data: defects }, { data: maintenance }, { data: checks }] = await Promise.all([
    supabase.from("vehicle_documents").select("*").eq("vehicle_id", id).order("expires_at", { ascending: true, nullsFirst: false }),
    supabase.from("vehicle_defects").select("*").eq("vehicle_id", id).order("reported_at", { ascending: false }),
    supabase.from("vehicle_maintenance").select("*").eq("vehicle_id", id).order("scheduled_at", { ascending: false, nullsFirst: false }),
    supabase.from("vehicle_checks").select("*").eq("vehicle_id", id).order("completed_at", { ascending: false }).limit(10),
  ]);

  async function addDocument(formData: FormData) {
    "use server";
    const docType = String(formData.get("doc_type") ?? "other") as VehicleDocType;
    const expiresAt = String(formData.get("expires_at") ?? "");
    await addVehicleDocument({
      vehicle_id: id,
      doc_type: docType,
      reference: String(formData.get("reference") ?? "") || null,
      expires_at: expiresAt || null,
    });
  }

  async function addDefect(formData: FormData) {
    "use server";
    const description = String(formData.get("description") ?? "").trim();
    if (!description) return;
    await reportDefect({
      vehicle_id: id,
      severity: String(formData.get("severity") ?? "minor") as DefectSeverity,
      description,
    });
  }

  async function resolveDefectAction(formData: FormData) {
    "use server";
    const defectId = String(formData.get("defect_id"));
    await resolveDefect(defectId, "Resolved by Office.");
  }

  async function addMaintenance(formData: FormData) {
    "use server";
    const type = String(formData.get("type") ?? "").trim();
    if (!type) return;
    await scheduleMaintenance({
      vehicle_id: id,
      type,
      scheduled_at: String(formData.get("scheduled_at") ?? "") || null,
      supplier: String(formData.get("supplier") ?? "") || null,
    });
  }

  async function markMaintenanceComplete(formData: FormData) {
    "use server";
    const maintenanceId = String(formData.get("maintenance_id"));
    await completeMaintenance({
      id: maintenanceId,
      vehicle_id: id,
      completed_at: new Date().toISOString().slice(0, 10),
    });
  }

  const today = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/office/vehicles" className="text-sm text-slate-500 hover:underline">
          ← Vehicles
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          {vehicle.registration} {vehicle.make_model ? `· ${vehicle.make_model}` : ""}
        </h1>
        <p className="text-sm text-slate-500">
          Status: <span className="font-medium">{vehicle.status}</span> · {vehicle.seat_capacity} seats
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Documents</h2>
        <ul className="mb-4 space-y-1 text-sm">
          {(documents ?? []).map((d) => {
            const expiring = d.expires_at && new Date(d.expires_at) <= soon;
            const expired = d.expires_at && new Date(d.expires_at) < today;
            return (
              <li
                key={d.id}
                className={expired ? "text-red-700" : expiring ? "text-amber-700" : "text-slate-700"}
              >
                {d.doc_type.toUpperCase()} {d.reference ? `(${d.reference})` : ""} —{" "}
                {d.expires_at ? `expires ${d.expires_at}` : "no expiry set"}
                {expired && " · EXPIRED"}
                {!expired && expiring && " · expiring soon"}
              </li>
            );
          })}
          {(!documents || documents.length === 0) && <li className="text-slate-500">No documents on file.</li>}
        </ul>
        <form action={addDocument} className="flex flex-wrap items-end gap-3">
          <select name="doc_type" className="rounded border border-slate-300 px-2 py-2 text-sm">
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input name="reference" placeholder="Reference" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Expires</label>
            <input name="expires_at" type="date" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Add document
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Defects</h2>
        <ul className="mb-4 space-y-2 text-sm">
          {(defects ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
              <span>
                <span className={d.severity === "critical" ? "font-semibold text-red-700" : "text-slate-700"}>
                  {d.severity}
                </span>{" "}
                — {d.description} ({d.status})
              </span>
              {d.status !== "resolved" && (
                <form action={resolveDefectAction}>
                  <input type="hidden" name="defect_id" value={d.id} />
                  <button type="submit" className="text-sm text-brand-dark underline">
                    Resolve
                  </button>
                </form>
              )}
            </li>
          ))}
          {(!defects || defects.length === 0) && <li className="text-slate-500">No defects reported.</li>}
        </ul>
        <form action={addDefect} className="flex flex-wrap items-end gap-3">
          <select name="severity" className="rounded border border-slate-300 px-2 py-2 text-sm">
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            name="description"
            placeholder="Describe the defect"
            required
            className="min-w-[220px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Report defect
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          A critical defect immediately marks this vehicle out of service and blocks new assignments.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Maintenance</h2>
        <ul className="mb-4 space-y-2 text-sm">
          {(maintenance ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded border border-slate-200 p-2">
              <span>
                {m.type} — {m.completed_at ? `completed ${m.completed_at}` : `scheduled ${m.scheduled_at ?? "TBC"}`}
              </span>
              {!m.completed_at && (
                <form action={markMaintenanceComplete}>
                  <input type="hidden" name="maintenance_id" value={m.id} />
                  <button type="submit" className="text-sm text-brand-dark underline">
                    Mark complete
                  </button>
                </form>
              )}
            </li>
          ))}
          {(!maintenance || maintenance.length === 0) && <li className="text-slate-500">Nothing scheduled.</li>}
        </ul>
        <form action={addMaintenance} className="flex flex-wrap items-end gap-3">
          <input name="type" placeholder="e.g. Annual service" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Scheduled</label>
            <input name="scheduled_at" type="date" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <input name="supplier" placeholder="Supplier" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Schedule
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Recent walkaround checks</h2>
        <ul className="space-y-1 text-sm">
          {(checks ?? []).map((c) => (
            <li
              key={c.id}
              className={c.result === "critical_defect" ? "font-semibold text-red-700" : c.result === "advisory_defect" ? "text-amber-700" : "text-slate-700"}
            >
              {new Date(c.completed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} —{" "}
              {c.check_type} — {c.result}
            </li>
          ))}
          {(!checks || checks.length === 0) && <li className="text-slate-500">No checks recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}
