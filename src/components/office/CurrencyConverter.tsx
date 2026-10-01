"use client";

import { useState } from "react";

const NAMES: Record<string, string> = {
  EUR: "Euro",
  GBP: "Pound",
  USD: "US dollar",
  ILS: "Israeli shekel",
  CHF: "Swiss franc",
  CAD: "Canadian dollar",
  AUD: "Australian dollar",
  JPY: "Japanese yen",
  PLN: "Polish złoty",
  CZK: "Czech koruna",
  HUF: "Hungarian forint",
  SEK: "Swedish krona",
  NOK: "Norwegian krone",
  DKK: "Danish krone",
};
const SYMBOL: Record<string, string> = { EUR: "€", GBP: "£", USD: "$", ILS: "₪", CHF: "CHF", JPY: "¥" };

function round(n: number) {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "";
}
function parse(s: string) {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function Field({
  code,
  value,
  onChange,
  onCode,
  codes,
}: {
  code: string;
  value: string;
  onChange: (v: string) => void;
  onCode?: (c: string) => void;
  codes?: string[];
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:ring-2 focus-within:ring-brand-dark/30">
      {onCode && codes ? (
        <select
          value={code}
          onChange={(e) => onCode(e.target.value)}
          aria-label="Currency"
          className="bg-transparent py-2 text-sm font-semibold text-slate-700"
        >
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <span className="w-8 shrink-0 text-lg font-semibold text-slate-700">{SYMBOL[code] ?? code}</span>
      )}
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        aria-label={`${NAMES[code] ?? code} amount`}
        className="min-w-0 flex-1 bg-transparent py-2.5 text-end text-lg font-semibold tabular-nums text-slate-900 outline-none"
      />
    </label>
  );
}

/**
 * Dashboard converter (owner, 1 Oct 2026): € ⇄ £ always on top, type in
 * either box; other currencies optional underneath. Reference only — ECB
 * daily rates, never used for fares or deposits.
 */
export function CurrencyConverter({ perEur, date }: { perEur: Record<string, number>; date: string }) {
  const rate = (from: string, to: string) => (perEur[to] ?? NaN) / (perEur[from] ?? NaN);

  const [eur, setEur] = useState("100");
  const [gbp, setGbp] = useState(round(100 * rate("EUR", "GBP")));

  const [showOther, setShowOther] = useState(false);
  const codes = Object.keys(perEur).sort((a, b) => {
    const pin = ["EUR", "GBP", "USD", "ILS", "CHF"];
    const ia = pin.indexOf(a);
    const ib = pin.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  const [from, setFrom] = useState("GBP");
  const [to, setTo] = useState("USD");
  const [fromAmt, setFromAmt] = useState("100");
  const [toAmt, setToAmt] = useState(round(100 * rate("GBP", "USD")));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">€ ⇄ £</h2>
        <span className="text-xs text-slate-500">
          €1 = £{round(rate("EUR", "GBP"))} · £1 = €{round(rate("GBP", "EUR"))}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Field
          code="EUR"
          value={eur}
          onChange={(v) => {
            setEur(v);
            setGbp(v === "" ? "" : round(parse(v) * rate("EUR", "GBP")));
          }}
        />
        <span aria-hidden className="text-slate-400">
          ⇄
        </span>
        <Field
          code="GBP"
          value={gbp}
          onChange={(v) => {
            setGbp(v);
            setEur(v === "" ? "" : round(parse(v) * rate("GBP", "EUR")));
          }}
        />
      </div>

      {!showOther ? (
        <button
          type="button"
          onClick={() => setShowOther(true)}
          className="mt-3 text-sm font-medium text-brand-dark underline"
        >
          Other currencies
        </button>
      ) : (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-2">
            <Field
              code={from}
              codes={codes}
              onCode={(c) => {
                setFrom(c);
                setToAmt(fromAmt === "" ? "" : round(parse(fromAmt) * rate(c, to)));
              }}
              value={fromAmt}
              onChange={(v) => {
                setFromAmt(v);
                setToAmt(v === "" ? "" : round(parse(v) * rate(from, to)));
              }}
            />
            <button
              type="button"
              aria-label="Swap currencies"
              onClick={() => {
                setFrom(to);
                setTo(from);
                setFromAmt(toAmt);
                setToAmt(fromAmt);
              }}
              className="shrink-0 rounded-lg border border-slate-300 px-2 py-2 text-slate-600"
            >
              ⇄
            </button>
            <Field
              code={to}
              codes={codes}
              onCode={(c) => {
                setTo(c);
                setToAmt(fromAmt === "" ? "" : round(parse(fromAmt) * rate(from, c)));
              }}
              value={toAmt}
              onChange={(v) => {
                setToAmt(v);
                setFromAmt(v === "" ? "" : round(parse(v) * rate(to, from)));
              }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            1 {from} = {round(rate(from, to))} {to}
          </p>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">
        European Central Bank rate of {date}. Reference only — fares and deposits use their fixed £/€ prices.
      </p>
    </section>
  );
}
