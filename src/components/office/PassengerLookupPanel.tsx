"use client";

import { useRef, useState } from "react";
import { searchPassengers, createPassenger } from "@/app/actions/passengers";
import type { PassengerCategory } from "@/types/database";
import { addressLabel, type AddressOption } from "./AddressAutocomplete";
import { CATEGORY_OPTIONS, categoryLabel } from "@/lib/categories";
import { Card, inputClass, outlineButtonClass } from "./booking/ui";

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
  onSelect: (passenger: PassengerSummary | null) => void;
  defaultPickup?: AddressOption | null;
  defaultDropoff?: AddressOption | null;
  defaultsError?: string | null;
}


/**
 * Build spec §32 "Caller" panel: passenger search, no-show/late-cancel
 * counts, standing waiver, language and default addresses. New-passenger
 * creation is inline so the operator never has to leave the console
 * mid-call.
 */
export function PassengerLookupPanel({
  selected,
  onSelect,
  defaultPickup,
  defaultDropoff,
  defaultsError,
}: PassengerLookupPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PassengerSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(next: string) {
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (next.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      const res = await searchPassengers(next);
      setError(res.error ? `Search failed: ${res.error}` : null);
      setResults((res.results ?? []) as PassengerSummary[]);
      setSearched(true);
    }, 250);
  }

  // New caller form, auto-saved (owner, 1 Oct 2026: no Save button). It
  // saves once a name and phone are in and typing pauses, or as soon as the
  // operator moves on to another part of the console with at least a name.
  // The form then turns into the selected caller, so there's one record.
  const [draft, setDraft] = useState({ full_name: "", phone: "", category: "man" as PassengerCategory });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  function startCreating() {
    setDraft({ full_name: query.trim(), phone: "", category: "man" });
    setCreating(true);
  }

  function updateDraft(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (next.full_name.trim().length >= 2 && next.phone.replace(/\D/g, "").length >= 7) {
      saveTimer.current = setTimeout(() => void saveDraft(next), 1200);
    }
  }

  async function saveDraft(d: typeof draft) {
    if (savingRef.current) return;
    const full_name = d.full_name.trim();
    if (full_name.length < 2) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    savingRef.current = true;
    setError(null);
    setSaving(true);
    const phone = d.phone.trim() || null;
    const { id, error: createError } = await createPassenger({
      full_name,
      category: d.category,
      phone,
      created_via: "phone",
    });
    setSaving(false);
    savingRef.current = false;
    if (createError || !id) {
      setError(createError ?? "Could not create the passenger.");
      return;
    }
    onSelect({
      id,
      full_name,
      phone,
      email: null,
      category: d.category,
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
    setSearched(false);
  }

  return (
    <Card
      step={1}
      title="Caller"
      action={
        selected ? (
          <button type="button" onClick={() => onSelect(null)} className={outlineButtonClass}>
            Change
          </button>
        ) : !creating ? (
          <button type="button" onClick={startCreating} className={outlineButtonClass}>
            + New passenger
          </button>
        ) : null
      }
    >
      {selected ? (
        <div className="space-y-1 text-sm">
          <p className="text-base font-semibold text-slate-900">{selected.full_name}</p>
          <p className="text-slate-600">
            {selected.phone ?? "No phone on file"} · {categoryLabel(selected.category)}
            {selected.preferred_language && ` · ${selected.preferred_language}`}
          </p>
          {selected.deposit_waiver_standing && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">Standing deposit waiver on file</p>
          )}
          <p className={selected.no_show_count > 0 ? "font-medium text-amber-800" : "text-slate-600"}>
            No-shows: {selected.no_show_count} · Late cancels: {selected.late_cancel_count}
          </p>
          <div className="pt-1 text-slate-600">
            <p>
              <span className="text-slate-500">Default pickup:</span>{" "}
              {defaultPickup ? addressLabel(defaultPickup) : selected.default_pickup_address_id ? "Loading..." : "none"}
            </p>
            <p>
              <span className="text-slate-500">Default drop-off:</span>{" "}
              {defaultDropoff
                ? addressLabel(defaultDropoff)
                : selected.default_dropoff_address_id
                  ? "Loading..."
                  : "none"}
            </p>
            {defaultsError && <p className="text-red-700">Couldn&apos;t load default addresses: {defaultsError}</p>}
          </div>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name..."
            aria-label="Search passengers by name"
            className={`mb-2 ${inputClass}`}
          />
          {error && (
            <p role="alert" className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {searched && results.length === 0 && !error && (
            <p className="mb-2 text-sm text-slate-500">No passenger found — tap + New passenger.</p>
          )}
          {results.length > 0 && (
            <ul className="mb-2 max-h-56 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {p.full_name} — {p.phone ?? "no phone"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {creating && (
            <div
              className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
              onBlur={(e) => {
                // Moving focus out of the whole form (not between its fields).
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void saveDraft(draft);
              }}
            >
              <input
                value={draft.full_name}
                onChange={(e) => updateDraft({ full_name: e.target.value })}
                placeholder="Full name"
                aria-label="Full name"
                className={inputClass}
              />
              <input
                value={draft.phone}
                onChange={(e) => updateDraft({ phone: e.target.value })}
                placeholder="Phone"
                type="tel"
                aria-label="Phone"
                className={inputClass}
              />
              <select
                value={draft.category}
                onChange={(e) => updateDraft({ category: e.target.value as PassengerCategory })}
                aria-label="Category"
                className={inputClass}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {saving ? "Saving…" : "Saves automatically once a name and phone are in."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (saveTimer.current) clearTimeout(saveTimer.current);
                    setCreating(false);
                  }}
                  className={outlineButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
