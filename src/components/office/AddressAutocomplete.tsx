"use client";

import { useRef, useState } from "react";
import { searchAddressesAction } from "@/app/actions/addresses";

export interface AddressOption {
  id: string;
  line1: string;
  postcode: string;
  fixed_point_name: string | null;
  address_type: string | null;
}

interface AddressAutocompleteProps {
  label: string;
  value: string;
  onSelect: (option: AddressOption) => void;
  placeholder?: string;
}

/**
 * Internal fuzzy-match autocomplete (build spec §16) — no external mapping
 * API. Debounced calls to searchAddressesAction (a thin wrapper around the
 * search_addresses() Postgres function). Fixed points sort first since
 * search_addresses() already orders by similarity then usage_count, and
 * fixed points tend to accumulate the highest usage_count in a community
 * operation where the same addresses recur constantly.
 */
export function AddressAutocomplete({ label, value, onSelect, placeholder }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AddressOption[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync the visible text when the parent's value changes for a reason
  // other than typing (e.g. the row was cleared, or a different address was
  // selected elsewhere) — done during render, not in a useEffect, per
  // React's guidance on adjusting state from props without an extra render
  // pass (https://react.dev/learn/you-might-not-need-an-effect).
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
      const { results: found } = await searchAddressesAction(next);
      setResults(
        (found as AddressOption[]).sort((a, b) => {
          const aFixed = a.address_type === "fixed_point" ? 0 : 1;
          const bFixed = b.address_type === "fixed_point" ? 0 : 1;
          return aFixed - bFixed;
        })
      );
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
        placeholder={placeholder ?? "Type an address..."}
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
