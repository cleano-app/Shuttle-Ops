"use client";

import { useRef, useState } from "react";
import { searchPassengers, createPassenger } from "@/app/actions/passengers";
import type { PassengerCategory } from "@/types/database";

export interface PassengerSummary {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  category: PassengerCategory;
  preferred_language: string | null;
  deposit_waiver_standing: boolean;
  no_show_count: number;
  late_cancel_count: number;
  default_pickup_address_id: string | null;
  default_dropoff_address_id: string | null;
}

interface PassengerLookupPanelProps {
  selected: PassengerSummary | null;
  onSelect: (passenger: PassengerSummary) => void;
}

/**
 * Build spec §32 "Caller" panel: passenger search, previous trips (deferred
 * — no trip-history query in Phase 1's console, count shown is no-show/
 * late-cancel only), standing waiver, language, mobility needs, default
 * addresses. New-passenger creation is inline so the operator never has to
 * leave the console mid-call.
 */
export function PassengerLookupPanel({ selected, onSelect }: PassengerLookupPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PassengerSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(next: string) {
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (next.trim().length < 2) {
        setResults([]);
        return;
      }
      const { results: found } = await searchPassengers(next);
      setResults((found ?? []) as PassengerSummary[]);
    }, 250);
  }

  async function handleCreate(formData: FormData) {
    const full_name = String(formData.get("full_name") ?? "").trim();
    const category = String(formData.get("category") ?? "man") as PassengerCategory;
    if (!full_name) return;
    const { id, error } = await createPassenger({
      full_name,
      category,
      phone: String(formData.get("phone") ?? "") || null,
      created_via: "phone",
    });
    if (error || !id) return;
    onSelect({
      id,
      full_name,
      phone: String(formData.get("phone") ?? "") || null,
      email: null,
      category,
      preferred_language: null,
      deposit_waiver_standing: false,
      no_show_count: 0,
      late_cancel_count: 0,
      default_pickup_address_id: null,
      default_dropoff_address_id: null,
    });
    setCreating(false);
    setQuery("");
    setResults([]);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium text-slate-900">Caller</h2>

      {selected ? (
        <div className="space-y-1 text-sm">
          <p className="text-base font-semibold text-slate-900">{selected.full_name}</p>
          <p className="text-slate-600">{selected.phone ?? "No phone on file"}</p>
          {selected.preferred_language && (
            <p className="text-slate-600">Language: {selected.preferred_language}</p>
          )}
          {selected.deposit_waiver_standing && (
            <p className="rounded bg-amber-50 px-2 py-1 text-amber-800">
              Standing deposit waiver on file
            </p>
          )}
          <p className="text-slate-600">
            No-shows: {selected.no_show_count} · Late cancels: {selected.late_cancel_count}
          </p>
          <button
            type="button"
            onClick={() => onSelect(null as unknown as PassengerSummary)}
            className="mt-2 text-sm text-slate-500 underline"
          >
            Change caller
          </button>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name..."
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          {results.length > 0 && (
            <ul className="mb-3 max-h-48 overflow-auto rounded border border-slate-200">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {p.full_name} — {p.phone ?? "no phone"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-sm font-medium text-brand-dark underline"
            >
              + New passenger
            </button>
          ) : (
            <form
              action={handleCreate}
              className="space-y-2 rounded border border-slate-200 p-3"
            >
              <input
                name="full_name"
                placeholder="Full name"
                required
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                name="phone"
                placeholder="Phone"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <select name="category" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="man">Man</option>
                <option value="woman">Woman</option>
                <option value="boy">Boy</option>
                <option value="girl">Girl</option>
                <option value="infant">Infant</option>
              </select>
              <div className="flex gap-2">
                <button type="submit" className="rounded bg-brand-dark px-3 py-1.5 text-sm font-medium text-white">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
