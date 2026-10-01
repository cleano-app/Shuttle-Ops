"use client";

import { useState } from "react";

import { computeFare } from "@/lib/tariffs/computeFare";
import { pickTariff, type TariffRow } from "@/lib/tariffs/pickTariff";
import { buildAddressSnapshot } from "@/lib/addresses/buildSnapshot";
import {
  AddressAutocomplete,
  addressLabel,
  type AddressOption,
  type AddressSuggestion,
  type AreaOption,
} from "./AddressAutocomplete";
import { defaultOccupiesSeat, emptyTravellerRow, type DepositDefaults, type TravellerRow } from "./types";
import type { Currency, DepartureDirection, PassengerCategory } from "@/types/database";

import { CATEGORY_OPTIONS } from "@/lib/categories";

export type { TariffRow };
export { pickTariff };

interface BookingFormPanelProps {
  travellers: TravellerRow[];
  onChange: (travellers: TravellerRow[]) => void;
  tariffs: TariffRow[];
  direction: DepartureDirection;
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
  areas?: AreaOption[];
  /** The caller's saved default addresses, pinned at the top of each picker. */
  addressSuggestions?: AddressSuggestion[];
  depositDefaults?: DepositDefaults;
  tariffError?: string | null;
  hasDeparture?: boolean;
}

/** Snapshot captured onto booking_passengers at booking time (spec §16). */
export function snapshotFor(option: AddressOption): Record<string, unknown> {
  return {
    ...buildAddressSnapshot({
      id: option.id,
      line1: option.line1,
      line2: option.line2 ?? null,
      city: option.city ?? null,
      postcode: option.postcode,
      country: option.country ?? "GB",
      formatted_address: option.formatted_address ?? null,
      access_notes: option.access_notes ?? null,
      fixed_point_name: option.fixed_point_name ?? null,
    }),
  };
}

export function formatMoney(amount: number, currency: Currency): string {
  return `${currency === "GBP" ? "£" : "€"}${amount.toFixed(2)}`;
}

const fieldClass = "mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

/**
 * Build spec §32 "Booking" panel: repeatable passenger rows (category incl.
 * infant, pickup/dropoff address, luggage, mobility, live fare preview via
 * computeFare — the same pure function that will price the actual booking),
 * contribution/sponsored/subsidy split, deposit/waiver.
 */
export function BookingFormPanel({
  travellers,
  onChange,
  tariffs,
  direction,
  currency,
  onCurrencyChange,
  areas = [],
  addressSuggestions = [],
  depositDefaults,
  tariffError,
  hasDeparture = false,
}: BookingFormPanelProps) {
  const depositAmount = depositDefaults?.[currency] ?? null;

  function updateRow(key: string, patch: Partial<TravellerRow>) {
    onChange(travellers.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    // New passengers in the same party usually share the first row's
    // addresses — copy them so the operator only changes what differs.
    const first = travellers[0];
    const row = emptyTravellerRow(currency);
    if (first) {
      row.pickupAddressId = first.pickupAddressId;
      row.pickupLabel = first.pickupLabel;
      row.pickupSnapshot = first.pickupSnapshot;
      row.dropoffAddressId = first.dropoffAddressId;
      row.dropoffLabel = first.dropoffLabel;
      row.dropoffSnapshot = first.dropoffSnapshot;
    }
    onChange([...travellers, row]);
  }

  // Family / group quick-add (owner, 1 Oct 2026): "me, my wife and four
  // children" in one step. Rows copy the first passenger's addresses; names
  // can stay blank and become "<surname> family N" on Reserve.
  const [familyOpen, setFamilyOpen] = useState(false);
  const [familyCounts, setFamilyCounts] = useState<Record<PassengerCategory, number>>({
    man: 0,
    woman: 0,
    boy: 0,
    girl: 0,
    infant: 0,
    unspecified: 0,
  });
  const familyTotal = Object.values(familyCounts).reduce((a, b) => a + b, 0);

  function addFamily() {
    const first = travellers[0];
    const rows: TravellerRow[] = [];
    for (const { value } of CATEGORY_OPTIONS) {
      for (let i = 0; i < familyCounts[value]; i++) {
        const row = emptyTravellerRow(currency);
        row.category = value;
        row.occupiesSeat = defaultOccupiesSeat(value);
        if (first) {
          row.pickupAddressId = first.pickupAddressId;
          row.pickupLabel = first.pickupLabel;
          row.pickupSnapshot = first.pickupSnapshot;
          row.dropoffAddressId = first.dropoffAddressId;
          row.dropoffLabel = first.dropoffLabel;
          row.dropoffSnapshot = first.dropoffSnapshot;
          row.depositWaived = first.depositWaived || first.standingWaiver;
        }
        rows.push(row);
      }
    }
    onChange([...travellers, ...rows]);
    setFamilyCounts({ man: 0, woman: 0, boy: 0, girl: 0, infant: 0, unspecified: 0 });
    setFamilyOpen(false);
  }

  function removeRow(key: string) {
    onChange(travellers.filter((row) => row.key !== key));
  }

  const depositsDue = travellers.filter((t) => !t.depositWaived && !t.standingWaiver).length;

  return (
    <section className="@container rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-slate-900">Booking</h2>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="booking-currency" className="text-slate-600">
            Currency
          </label>
          <select
            id="booking-currency"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      {tariffError && (
        <p role="alert" className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">
          Couldn&apos;t load fares for this route: {tariffError}
        </p>
      )}

      <div className="space-y-4">
        {travellers.map((row, index) => {
          const rowTariff = pickTariff(tariffs, row.category, direction);
          const fare = rowTariff
            ? computeFare({
                tariff: rowTariff,
                currency,
                luggage: row.luggage,
                contribution: row.contribution,
                sponsored: row.sponsored,
              })
            : null;
          const waived = row.depositWaived || row.standingWaiver;

          return (
            <div key={row.key} className="rounded border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Passenger {index + 1}</p>
                {travellers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-sm text-red-600 underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
                <input
                  value={row.passengerName}
                  onChange={(e) =>
                    // Renaming a row detaches it from the matched passenger
                    // record — a new passenger is created at Reserve time.
                    updateRow(row.key, {
                      passengerName: e.target.value,
                      passengerId: null,
                      standingWaiver: false,
                    })
                  }
                  placeholder="Name (optional for family)"
                  aria-label={`Passenger ${index + 1} name`}
                  className="col-span-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <select
                  value={row.category}
                  aria-label={`Passenger ${index + 1} category`}
                  onChange={(e) => {
                    const category = e.target.value as PassengerCategory;
                    updateRow(row.key, { category, occupiesSeat: defaultOccupiesSeat(category) });
                  }}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.occupiesSeat}
                    onChange={(e) => updateRow(row.key, { occupiesSeat: e.target.checked })}
                  />
                  Occupies seat
                </label>
              </div>
              {row.passengerId && (
                <p className="mt-1 text-xs text-slate-500">Linked to an existing passenger record.</p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 @lg:grid-cols-2">
                <AddressAutocomplete
                  label="Pickup"
                  value={row.pickupLabel}
                  areas={areas}
                  suggestions={addressSuggestions}
                  onSelect={(option: AddressOption) =>
                    updateRow(row.key, {
                      pickupAddressId: option.id,
                      pickupLabel: addressLabel(option),
                      pickupSnapshot: snapshotFor(option),
                    })
                  }
                />
                <AddressAutocomplete
                  label="Drop-off"
                  value={row.dropoffLabel}
                  areas={areas}
                  suggestions={addressSuggestions}
                  onSelect={(option: AddressOption) =>
                    updateRow(row.key, {
                      dropoffAddressId: option.id,
                      dropoffLabel: addressLabel(option),
                      dropoffSnapshot: snapshotFor(option),
                    })
                  }
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 @md:grid-cols-4">
                {(["large", "small", "hand", "oversize"] as const).map((kind) => (
                  <label key={kind} className="text-sm capitalize text-slate-700">
                    {kind}
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={row.luggage[kind]}
                      onChange={(e) =>
                        updateRow(row.key, {
                          luggage: { ...row.luggage, [kind]: Math.max(0, Number(e.target.value) || 0) },
                        })
                      }
                      className={fieldClass}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-3 flex flex-col gap-2 @md:flex-row @md:items-center">
                <label className="flex shrink-0 items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.wheelchairSpace}
                    onChange={(e) => updateRow(row.key, { wheelchairSpace: e.target.checked })}
                  />
                  Wheelchair space
                </label>
                <input
                  value={row.mobilityNeeds}
                  onChange={(e) => updateRow(row.key, { mobilityNeeds: e.target.value })}
                  placeholder="Mobility needs (optional)"
                  aria-label={`Passenger ${index + 1} mobility needs`}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm text-slate-700">
                  Contribution
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={row.contribution}
                    onChange={(e) => updateRow(row.key, { contribution: Math.max(0, Number(e.target.value) || 0) })}
                    className={fieldClass}
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Sponsored
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={row.sponsored}
                    onChange={(e) => updateRow(row.key, { sponsored: Math.max(0, Number(e.target.value) || 0) })}
                    className={fieldClass}
                  />
                </label>
              </div>

              <div
                className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${
                  waived ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
                }`}
              >
                <p className={waived ? "text-green-800" : "text-amber-900"}>
                  <span className="font-medium">Deposit:</span>{" "}
                  {waived
                    ? row.standingWaiver
                      ? "waived (standing waiver)"
                      : "waived"
                    : depositAmount != null
                      ? `${formatMoney(depositAmount, currency)} required`
                      : "required (amount not configured)"}
                </p>
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={waived}
                    disabled={row.standingWaiver}
                    onChange={(e) => updateRow(row.key, { depositWaived: e.target.checked })}
                  />
                  {row.standingWaiver ? "Standing waiver" : "Waive deposit"}
                </label>
              </div>

              {fare ? (
                <div
                  className={`mt-3 rounded p-2 text-sm ${
                    fare.isValid ? "bg-slate-50 text-slate-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  Notional {formatMoney(fare.notionalFare, currency)} = contribution {fare.contribution.toFixed(2)} +
                  sponsored {fare.sponsored.toFixed(2)} + subsidy {fare.subsidy.toFixed(2)}
                  {!fare.isValid && " — contribution + sponsored is more than the notional fare."}
                  {fare.luggageCharge > 0 && ` (includes ${fare.luggageCharge.toFixed(2)} luggage charge)`}
                </div>
              ) : (
                hasDeparture ? (
                  <p className="mt-3 rounded bg-slate-50 p-2 text-sm text-slate-500">
                    No tariff for a {row.category} on this route — fare will be recorded as 0.
                  </p>
                ) : null
              )}
            </div>
          );
        })}
      </div>

      {familyOpen && (
        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-medium text-slate-800">Add family / group</p>
          <div className="grid grid-cols-3 gap-2 @md:grid-cols-6">
            {CATEGORY_OPTIONS.map((c) => (
              <label key={c.value} className="text-xs text-slate-600">
                {c.label}
                <input
                  type="number"
                  min={0}
                  max={20}
                  inputMode="numeric"
                  value={familyCounts[c.value]}
                  onChange={(e) =>
                    setFamilyCounts({ ...familyCounts, [c.value]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })
                  }
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Same pickup and drop-off as passenger 1. Names are optional — blank ones are saved as the caller&apos;s
            surname + &ldquo;family&rdquo;.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={familyTotal === 0}
              onClick={addFamily}
              className="rounded bg-blue-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Add {familyTotal || ""} passenger{familyTotal === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              onClick={() => setFamilyOpen(false)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Add passenger
          </button>
          {!familyOpen && (
            <button
              type="button"
              onClick={() => setFamilyOpen(true)}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + Add family / group
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {travellers.length} passenger{travellers.length === 1 ? "" : "s"} ·{" "}
          {depositsDue === 0
            ? "no deposits due"
            : depositAmount != null
              ? `deposits due ${formatMoney(depositAmount * depositsDue, currency)} (${depositsDue})`
              : `${depositsDue} deposit${depositsDue === 1 ? "" : "s"} due`}
        </p>
      </div>
    </section>
  );
}
