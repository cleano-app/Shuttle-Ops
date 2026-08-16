"use client";

import { computeFare, type TariffLike } from "@/lib/tariffs/computeFare";
import { AddressAutocomplete, type AddressOption } from "./AddressAutocomplete";
import { defaultOccupiesSeat, emptyTravellerRow, type TravellerRow } from "./types";
import type { Currency, DepartureDirection, PassengerCategory } from "@/types/database";

const CATEGORIES: PassengerCategory[] = ["man", "woman", "boy", "girl", "infant"];

export interface TariffRow extends TariffLike {
  category: PassengerCategory | null;
  direction: DepartureDirection | null;
}

/** Most specific match first: exact category+direction, then category with
 * direction-agnostic (null), then a fully generic route-wide row. Prices
 * are still copied onto the booking at submit time — this selection only
 * decides which row's numbers apply, per build spec §14. */
export function pickTariff(
  tariffs: TariffRow[],
  category: PassengerCategory,
  direction: DepartureDirection
): TariffRow | null {
  return (
    tariffs.find((t) => t.category === category && t.direction === direction) ??
    tariffs.find((t) => t.category === category && t.direction === null) ??
    tariffs.find((t) => t.category === null && t.direction === direction) ??
    tariffs.find((t) => t.category === null && t.direction === null) ??
    null
  );
}

interface BookingFormPanelProps {
  travellers: TravellerRow[];
  onChange: (travellers: TravellerRow[]) => void;
  tariffs: TariffRow[];
  direction: DepartureDirection;
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

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
}: BookingFormPanelProps) {
  function updateRow(key: string, patch: Partial<TravellerRow>) {
    onChange(travellers.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange([...travellers, emptyTravellerRow(currency)]);
  }

  function removeRow(key: string) {
    onChange(travellers.filter((row) => row.key !== key));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-slate-900">Booking</h2>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600">Currency</label>
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            className="rounded border border-slate-300 px-2 py-1"
          >
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

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

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <input
                  value={row.passengerName}
                  onChange={(e) => updateRow(row.key, { passengerName: e.target.value })}
                  placeholder="Name"
                  className="col-span-2 rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={row.category}
                  onChange={(e) => {
                    const category = e.target.value as PassengerCategory;
                    updateRow(row.key, { category, occupiesSeat: defaultOccupiesSeat(category) });
                  }}
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
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

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <AddressAutocomplete
                  label="Pickup"
                  value={row.pickupLabel}
                  onSelect={(option: AddressOption) =>
                    updateRow(row.key, {
                      pickupAddressId: option.id,
                      pickupLabel: option.line1,
                      pickupSnapshot: {
                        address_id: option.id,
                        line1: option.line1,
                        postcode: option.postcode,
                        fixed_point_name: option.fixed_point_name,
                        snapshotted_at: new Date().toISOString(),
                      },
                    })
                  }
                />
                <AddressAutocomplete
                  label="Drop-off"
                  value={row.dropoffLabel}
                  onSelect={(option: AddressOption) =>
                    updateRow(row.key, {
                      dropoffAddressId: option.id,
                      dropoffLabel: option.line1,
                      dropoffSnapshot: {
                        address_id: option.id,
                        line1: option.line1,
                        postcode: option.postcode,
                        fixed_point_name: option.fixed_point_name,
                        snapshotted_at: new Date().toISOString(),
                      },
                    })
                  }
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <label className="text-sm text-slate-700">
                  Large
                  <input
                    type="number"
                    min={0}
                    value={row.luggage.large}
                    onChange={(e) =>
                      updateRow(row.key, { luggage: { ...row.luggage, large: Number(e.target.value) } })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Small
                  <input
                    type="number"
                    min={0}
                    value={row.luggage.small}
                    onChange={(e) =>
                      updateRow(row.key, { luggage: { ...row.luggage, small: Number(e.target.value) } })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Hand
                  <input
                    type="number"
                    min={0}
                    value={row.luggage.hand}
                    onChange={(e) =>
                      updateRow(row.key, { luggage: { ...row.luggage, hand: Number(e.target.value) } })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Oversize
                  <input
                    type="number"
                    min={0}
                    value={row.luggage.oversize}
                    onChange={(e) =>
                      updateRow(row.key, { luggage: { ...row.luggage, oversize: Number(e.target.value) } })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.wheelchairSpace}
                    onChange={(e) => updateRow(row.key, { wheelchairSpace: e.target.checked })}
                  />
                  Wheelchair
                </label>
              </div>

              <input
                value={row.mobilityNeeds}
                onChange={(e) => updateRow(row.key, { mobilityNeeds: e.target.value })}
                placeholder="Mobility needs (optional)"
                className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="text-sm text-slate-700">
                  Contribution
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.contribution}
                    onChange={(e) => updateRow(row.key, { contribution: Number(e.target.value) })}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Sponsored
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.sponsored}
                    onChange={(e) => updateRow(row.key, { sponsored: Number(e.target.value) })}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.depositWaived}
                    onChange={(e) => updateRow(row.key, { depositWaived: e.target.checked })}
                  />
                  Waive deposit
                </label>
              </div>

              {fare && (
                <div
                  className={`mt-3 rounded p-2 text-sm ${
                    fare.isValid ? "bg-slate-50 text-slate-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  Notional {currency === "GBP" ? "£" : "€"}
                  {fare.notionalFare.toFixed(2)} = contribution {fare.contribution.toFixed(2)} + sponsored{" "}
                  {fare.sponsored.toFixed(2)} + subsidy {fare.subsidy.toFixed(2)}
                  {!fare.isValid && " — contribution + sponsored exceeds the notional fare."}
                  {fare.luggageCharge > 0 && ` (includes ${fare.luggageCharge.toFixed(2)} luggage charge)`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-4 rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        + Add passenger
      </button>
    </section>
  );
}
