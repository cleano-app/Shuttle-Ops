"use client";

import { useId, useRef, useState } from "react";
import { createAddress, searchAddressesAction } from "@/app/actions/addresses";
import { isLikelyDuplicate } from "@/lib/addresses/fuzzyMatch";

export interface AddressOption {
  id: string;
  line1: string;
  line2?: string | null;
  city?: string | null;
  postcode: string;
  country?: string | null;
  formatted_address?: string | null;
  access_notes?: string | null;
  fixed_point_name: string | null;
  address_type: string | null;
}

export interface AreaOption {
  id: string;
  name: string;
  country: string;
}

/** A caller's saved address, offered at the top of the list. */
export interface AddressSuggestion {
  tag: string;
  address: AddressOption;
}

interface AddressAutocompleteProps {
  label: string;
  value: string;
  onSelect: (option: AddressOption) => void;
  placeholder?: string;
  areas?: AreaOption[];
  suggestions?: AddressSuggestion[];
}

export function addressLabel(a: AddressOption): string {
  const main = [a.line1, a.postcode].filter(Boolean).join(", ");
  return a.fixed_point_name ? `${a.fixed_point_name} — ${main}` : main;
}

const inputClass =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800";

/**
 * Internal fuzzy-match autocomplete (build spec §16) — no external mapping
 * API. Debounced calls to searchAddressesAction (a thin wrapper around the
 * search_addresses() Postgres function). The caller's default addresses
 * are pinned at the top, fixed points next, and "+ New address" lets
 * Office add an address for a new caller without leaving the console.
 */
export function AddressAutocomplete({
  label,
  value,
  onSelect,
  placeholder,
  areas = [],
  suggestions = [],
}: AddressAutocompleteProps) {
  const inputId = useId();
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AddressOption[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync the visible text when the parent's value changes for a reason
  // other than typing (e.g. the row was cleared, or a default address was
  // filled in) — done during render, not in a useEffect, per React's
  // guidance on adjusting state from props.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(value);
  }

  function choose(option: AddressOption) {
    onSelect(option);
    setQuery(addressLabel(option));
    setOpen(false);
    setCreating(false);
  }

  function handleChange(next: string) {
    setQuery(next);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (next.trim().length < 2) {
        setResults([]);
        setSearchError(null);
        return;
      }
      setSearching(true);
      const res = await searchAddressesAction(next);
      setSearching(false);
      setSearchError(res.error ?? null);
      setResults(
        ((res.results ?? []) as AddressOption[]).slice().sort((a, b) => {
          const aFixed = a.address_type === "fixed_point" ? 0 : 1;
          const bFixed = b.address_type === "fixed_point" ? 0 : 1;
          return aFixed - bFixed;
        })
      );
    }, 250);
  }

  const suggestionIds = new Set(suggestions.map((s) => s.address.id));
  const otherResults = results.filter((r) => !suggestionIds.has(r.id));
  const showList = open && !creating;

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Type an address or postcode..."}
        className={inputClass}
        autoComplete="off"
      />
      {searchError && <p className="mt-1 text-xs text-red-700">Address search failed: {searchError}</p>}

      {showList && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border border-slate-300 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li key={`s-${s.tag}-${s.address.id}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s.address)}
                className="block w-full border-b border-slate-100 bg-blue-50/60 px-3 py-2 text-left text-sm hover:bg-blue-50"
              >
                <span className="mr-1 rounded bg-blue-900 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {s.tag}
                </span>
                {addressLabel(s.address)}
              </button>
            </li>
          ))}
          {otherResults.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                {r.fixed_point_name && <span className="mr-1 font-medium text-blue-900">{r.fixed_point_name}</span>}
                {r.line1}, {r.postcode}
              </button>
            </li>
          ))}
          {searching && <li className="px-3 py-2 text-sm text-slate-500">Searching...</li>}
          {!searching && query.trim().length >= 2 && otherResults.length === 0 && !searchError && (
            <li className="px-3 py-2 text-sm text-slate-500">No saved address matches.</li>
          )}
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setCreating(true);
                setOpen(false);
              }}
              className="block w-full border-t border-slate-200 px-3 py-2 text-left text-sm font-medium text-blue-900 hover:bg-slate-50"
            >
              + New address
            </button>
          </li>
        </ul>
      )}

      {!creating && !open && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-1 text-xs font-medium text-blue-900 underline"
        >
          + New address
        </button>
      )}

      {creating && (
        <NewAddressForm
          initialLine1={query}
          areas={areas}
          existing={[...suggestions.map((s) => s.address), ...results]}
          onCancel={() => setCreating(false)}
          onCreated={choose}
        />
      )}
    </div>
  );
}

function NewAddressForm({
  initialLine1,
  areas,
  existing,
  onCancel,
  onCreated,
}: {
  initialLine1: string;
  areas: AreaOption[];
  existing: AddressOption[];
  onCancel: () => void;
  onCreated: (option: AddressOption) => void;
}) {
  // A typed postcode-looking query shouldn't land in line 1.
  const looksLikePostcode = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$|^\d{4}$/.test(initialLine1.trim());
  const [line1, setLine1] = useState(looksLikePostcode ? "" : initialLine1);
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState(looksLikePostcode ? initialLine1.trim().toUpperCase() : "");
  const [country, setCountry] = useState<"GB" | "BE">("GB");
  const [areaId, setAreaId] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areasForCountry = areas.filter((a) => a.country === country);
  const areaChoices = areasForCountry;

  const duplicate =
    line1.trim() && postcode.trim()
      ? existing.find((e) => isLikelyDuplicate({ line1, postcode }, { line1: e.line1, postcode: e.postcode }))
      : undefined;

  async function save() {
    setError(null);
    if (!line1.trim()) return setError("Line 1 is required.");
    if (!postcode.trim()) return setError("Postcode is required.");
    setSaving(true);
    const input = {
      line1: line1.trim(),
      line2: line2.trim() || null,
      city: city.trim() || null,
      postcode: postcode.trim().toUpperCase(),
      country,
      area_id: areaId || null,
      access_notes: accessNotes.trim() || null,
      address_type: "residential" as const,
    };
    const res = await createAddress(input);
    setSaving(false);
    if (res.error || !res.id) {
      setError(res.error ?? "Could not save the address.");
      return;
    }
    onCreated({
      id: res.id,
      ...input,
      formatted_address: null,
      fixed_point_name: null,
    });
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-blue-200 bg-blue-50/40 p-3">
      <p className="text-sm font-medium text-slate-800">New address</p>
      <input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Line 1 *" className={inputClass} />
      <input value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Line 2" className={inputClass} />
      <div className="grid grid-cols-2 gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City / town" className={inputClass} />
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          placeholder="Postcode *"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          Country
          <select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value as "GB" | "BE");
              setAreaId("");
            }}
            className={`mt-1 ${inputClass}`}
          >
            <option value="GB">United Kingdom (GB)</option>
            <option value="BE">Belgium (BE)</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Area
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={`mt-1 ${inputClass}`}>
            <option value="">{areaChoices.length ? "No area yet" : "No areas set up for this country"}</option>
            {areaChoices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        value={accessNotes}
        onChange={(e) => setAccessNotes(e.target.value)}
        placeholder="Access notes (gate code, which door, stairs...)"
        rows={2}
        className={inputClass}
      />
      {duplicate && (
        <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          This looks like an existing address: {addressLabel(duplicate)}.{" "}
          <button type="button" onClick={() => onCreated(duplicate)} className="font-medium underline">
            Use that one
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-950 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save address"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
