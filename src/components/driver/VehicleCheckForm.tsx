"use client";

import { useState } from "react";
import { submitVehicleCheck, type VehicleCheckItem } from "@/app/actions/fleet";
import type { VehicleCheckType } from "@/types/database";

const CHECKLIST_ITEMS = [
  "Tyres",
  "Lights",
  "Mirrors",
  "Windscreen",
  "Fluids",
  "Body damage",
  "Seatbelts",
  "Doors",
  "Safety equipment",
];

interface VehicleCheckFormProps {
  vehicleId: string;
  vehicleRegistration: string;
  departureId?: string | null;
  checkType: VehicleCheckType;
}

/** Build spec §29: driver mobile walkaround, pass/advisory_defect/
 * critical_defect per item. A critical result immediately takes the
 * vehicle out of service server-side (0031's trigger) — this form just
 * collects the per-item statuses and submits once. */
export function VehicleCheckForm({ vehicleId, vehicleRegistration, departureId, checkType }: VehicleCheckFormProps) {
  const [items, setItems] = useState<VehicleCheckItem[]>(
    CHECKLIST_ITEMS.map((label) => ({ key: label.toLowerCase().replace(/\s+/g, "_"), label, status: "ok" }))
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  function updateStatus(key: string, status: VehicleCheckItem["status"]) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status } : i)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    const { error } = await submitVehicleCheck({
      vehicle_id: vehicleId,
      departure_id: departureId ?? null,
      check_type: checkType,
      items,
      notes: notes || null,
    });
    setSubmitting(false);
    if (error) {
      setResult({ error });
      return;
    }
    const worst = items.some((i) => i.status === "critical")
      ? "critical_defect"
      : items.some((i) => i.status === "advisory")
        ? "advisory_defect"
        : "pass";
    setResult({
      message:
        worst === "critical_defect"
          ? "Check submitted — critical defect logged, vehicle marked out of service. Contact the office."
          : worst === "advisory_defect"
            ? "Check submitted with an advisory note."
            : "Check submitted — all clear.",
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">
        {checkType === "pre_trip" ? "Pre-trip" : "Post-trip"} check — {vehicleRegistration}
      </h1>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="rounded border border-slate-200 p-3">
            <p className="mb-2 font-medium text-slate-800">{item.label}</p>
            <div className="flex gap-2">
              {(["ok", "advisory", "critical"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => updateStatus(item.key, status)}
                  className={`flex-1 rounded py-2 text-sm font-medium ${
                    item.status === status
                      ? status === "ok"
                        ? "bg-green-600 text-white"
                        : status === "advisory"
                          ? "bg-amber-500 text-white"
                          : "bg-red-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {status === "ok" ? "OK" : status === "advisory" ? "Advisory" : "Critical"}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded border border-slate-300 p-2 text-sm"
        rows={3}
      />

      {result?.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{result.error}</p>}
      {result?.message && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{result.message}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-lg bg-brand-dark py-3 text-lg font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit check"}
      </button>
    </div>
  );
}
