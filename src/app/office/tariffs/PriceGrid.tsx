"use client";

import { useState, useTransition } from "react";
import { setPrice, setRouteLuggage } from "@/app/actions/tariffs";
import { Journey } from "@/components/Journey";
import type { DepartureDirection, PassengerCategory } from "@/types/database";

export interface PriceRow {
  id: string;
  direction: DepartureDirection | null;
  category: PassengerCategory | null;
  base_fare_gbp: number;
  base_fare_eur: number;
  luggage_large_allowance: number;
  luggage_small_allowance: number;
  luggage_hand_allowance: number;
  luggage_additional_charge_gbp: number;
  luggage_additional_charge_eur: number;
  luggage_oversize_charge_gbp: number;
  luggage_oversize_charge_eur: number;
}

const TYPES: { value: PassengerCategory | null; label: string }[] = [
  { value: null, label: "Everyone (standard)" },
  { value: "man", label: "Man" },
  { value: "woman", label: "Woman" },
  { value: "boy", label: "Boy" },
  { value: "girl", label: "Girl" },
  { value: "infant", label: "Infant" },
];

/** Same order as src/lib/tariffs/pickTariff.ts. */
function effective(rows: PriceRow[], dir: DepartureDirection, cat: PassengerCategory | null) {
  const f = (d: DepartureDirection | null, c: PassengerCategory | null) =>
    rows.find((r) => r.direction === d && r.category === c);
  return (cat ? f(dir, cat) ?? f(null, cat) : undefined) ?? f(dir, null) ?? f(null, null) ?? null;
}

function MoneyCell({
  routeId,
  direction,
  category,
  currency,
  own,
  inherited,
}: {
  routeId: string;
  direction: DepartureDirection | null;
  category: PassengerCategory | null;
  currency: "GBP" | "EUR";
  own: number | null;
  inherited: number | null;
}) {
  const [value, setValue] = useState(own == null ? "" : String(own));
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const [pending, start] = useTransition();
  const sym = currency === "GBP" ? "£" : "€";

  function save() {
    const amount = value.trim() === "" ? null : Number(value.replace(",", "."));
    if (amount === own || (amount != null && Number.isNaN(amount))) return;
    start(async () => {
      const res = await setPrice({ routeId, direction, category, currency, amount });
      setState(res.error ?? "saved");
      if (!res.error) setTimeout(() => setState("idle"), 1500);
    });
  }

  return (
    <label className="relative block">
      <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{sym}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder={inherited == null ? "—" : String(inherited)}
        aria-label={`${currency} price`}
        className={`w-full rounded-lg border bg-white py-2 pe-2 ps-6 text-end text-sm tabular-nums ${
          state !== "idle" && state !== "saved" ? "border-red-400" : "border-slate-300"
        } ${own == null ? "placeholder:text-slate-400" : ""}`}
      />
      {(pending || state === "saved") && (
        <span className="absolute -top-2 end-1 rounded bg-white px-1 text-[10px] text-emerald-700">
          {pending ? "…" : "Saved"}
        </span>
      )}
      {state !== "idle" && state !== "saved" && <span className="mt-0.5 block text-[11px] text-red-700">{state}</span>}
    </label>
  );
}

function LuggageField({
  routeId,
  field,
  label,
  initial,
  money,
}: {
  routeId: string;
  field: keyof PriceRow;
  label: string;
  initial: number;
  money?: "GBP" | "EUR";
}) {
  const [value, setValue] = useState(String(initial));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="text-xs text-slate-600">
      {label}
      <span className="relative mt-0.5 block">
        {money && (
          <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            {money === "GBP" ? "£" : "€"}
          </span>
        )}
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            const n = Number(value.replace(",", "."));
            if (n === initial || Number.isNaN(n)) return;
            start(async () => {
              const res = await setRouteLuggage(routeId, { [field]: n });
              setMsg(res.error ?? "Saved");
            });
          }}
          className={`w-full rounded-lg border border-slate-300 bg-white py-2 pe-2 text-end text-sm tabular-nums ${money ? "ps-6" : "ps-2"}`}
        />
      </span>
      {(pending || msg) && (
        <span className={`text-[11px] ${msg && msg !== "Saved" ? "text-red-700" : "text-emerald-700"}`}>{pending ? "Saving…" : msg}</span>
      )}
    </label>
  );
}

/**
 * The price list for one route (owner, 1 Oct 2026: "pricing is from the
 * price list on settings"). A card per journey; each passenger type has a
 * £ and € price. Empty boxes show, greyed, the standard price they inherit.
 * Saves as you leave a box.
 */
export function PriceGrid({ routeId, routeName, rows }: { routeId: string; routeName: string; rows: PriceRow[] }) {
  const standard = rows.find((r) => r.direction === null && r.category === null) ?? rows[0] ?? null;
  return (
    <div className="space-y-4">
      {(["outbound", "return"] as const).map((dir) => (
        <section key={dir} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <Journey routeName={routeName} direction={dir} />
          </div>
          <div className="grid grid-cols-[1fr_6rem_6rem] items-center gap-x-2 gap-y-2 p-4 text-sm">
            <span />
            <span className="text-end text-xs font-semibold text-slate-500">£</span>
            <span className="text-end text-xs font-semibold text-slate-500">€</span>
            {TYPES.map((t) => {
              const own = rows.find((r) => r.direction === dir && r.category === t.value) ?? null;
              const parent = effective(
                rows.filter((r) => r !== own),
                dir,
                t.value
              );
              return (
                <div key={String(t.value)} className="contents">
                  <span className={t.value === null ? "font-semibold text-slate-900" : "text-slate-700"}>{t.label}</span>
                  {(["GBP", "EUR"] as const).map((cur) => (
                    <MoneyCell
                      key={cur}
                      routeId={routeId}
                      direction={dir}
                      category={t.value}
                      currency={cur}
                      own={own ? Number(cur === "GBP" ? own.base_fare_gbp : own.base_fare_eur) : null}
                      inherited={parent ? Number(cur === "GBP" ? parent.base_fare_gbp : parent.base_fare_eur) : null}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {standard && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-1 font-semibold text-slate-900">Luggage</h3>
          <p className="mb-3 text-xs text-slate-500">Included per passenger, and the charge for each extra bag.</p>
          <div className="grid grid-cols-3 gap-3">
            <LuggageField routeId={routeId} field="luggage_large_allowance" label="Large included" initial={standard.luggage_large_allowance} />
            <LuggageField routeId={routeId} field="luggage_small_allowance" label="Small included" initial={standard.luggage_small_allowance} />
            <LuggageField routeId={routeId} field="luggage_hand_allowance" label="Hand included" initial={standard.luggage_hand_allowance} />
            <LuggageField routeId={routeId} field="luggage_additional_charge_gbp" label="Extra bag" initial={Number(standard.luggage_additional_charge_gbp)} money="GBP" />
            <LuggageField routeId={routeId} field="luggage_additional_charge_eur" label="Extra bag" initial={Number(standard.luggage_additional_charge_eur)} money="EUR" />
            <span />
            <LuggageField routeId={routeId} field="luggage_oversize_charge_gbp" label="Buggy" initial={Number(standard.luggage_oversize_charge_gbp)} money="GBP" />
            <LuggageField routeId={routeId} field="luggage_oversize_charge_eur" label="Buggy" initial={Number(standard.luggage_oversize_charge_eur)} money="EUR" />
          </div>
        </section>
      )}
    </div>
  );
}
