"use client";

import { useRef, useState } from "react";
import { searchAddressesForPortal } from "@/app/actions/portalAddresses";

export interface PortalAddressOption {
  id: string;
  line1: string;
  postcode: string;
  fixed_point_name: string | null;
  address_type: string | null;
}

interface PortalAddressAutocompleteProps {
  label: string;
  value: string;
  onSelect: (option: PortalAddressOption) => void;
  placeholder?: string;
}

/** Portal counterpart of src/components/office/AddressAutocomplete.tsx —
 * same debounced fuzzy-search UX, but calls searchAddressesForPortal
 * (getPortalSession-gated) instead of the office-only searchAddressesAction
 * (getSession-gated, always returns "Not authenticated" for a portal
 * user). */
export function PortalAddressAutocomplete({ label, value, onSelect, placeholder }: PortalAddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<PortalAddressOption[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(value);
  }

  function handleChange(next: string) {
    setQuery(next);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (next.trim().length < 2) {
        setResults([]);
        return;
      }
      const { addresses } = await searchAddressesForPortal(next);
      setResults(addresses as PortalAddressOption[]);
    }, 250);
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-300 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(r);
                  setQuery(r.fixed_point_name ? `${r.fixed_point_name} — ${r.line1}` : r.line1);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                {r.fixed_point_name && (
                  <span className="mr-1 font-medium text-brand-dark">{r.fixed_point_name}</span>
                )}
                {r.line1}, {r.postcode}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
