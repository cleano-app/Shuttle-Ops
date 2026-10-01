"use client";

import { useState } from "react";

import { pickTariff, type TariffRow } from "@/lib/tariffs/pickTariff";
import { buildAddressSnapshot } from "@/lib/addresses/buildSnapshot";
import {
  AddressAutocomplete,
  addressLabel,
  type AddressOption,
  type AddressSuggestion,
  type AreaOption,
} from "./AddressAutocomplete";
import { defaultOccupiesSeat, type DepositDefaults, type TravellerRow, fareFor } from "./types";
import type { Currency, DepartureDirection, PassengerCategory } from "@/types/database";
import { CATEGORY_OPTIONS, categoryLabel } from "@/lib/categories";
import { Stepper } from "./booking/Stepper";
import { Card, Disclosure, StepperRow, inputClass, outlineButtonClass } from "./booking/ui";
import {
  adjustLuggage,
  countByCategory,
  newPartyRow,
  removableIndex,
  setWheelchairCount,
  sharedValue,
  type LuggageKind,
} from "./booking/party";

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
  /** 2 when a return leg is booked too: fares and contributions count twice. */
  legs?: number;
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

const LUGGAGE: { kind: LuggageKind; label: string }[] = [
  { kind: "large", label: "Large" },
  { kind: "small", label: "Small" },
  { kind: "hand", label: "Hand" },
  { kind: "oversize", label: "Oversize" },
];

function passengerTitle(row: TravellerRow, index: number): string {
  return row.passengerName.trim() || `Passenger ${index + 1} (${categoryLabel(row.category)})`;
}

/**
 * Build spec §32 "Booking" panel as party-level cards (owner, 1 Oct 2026):
 * 3 Who's travelling (− n + per category), 4 Pick-up & drop-off (one pair
 * for everyone, per-passenger overrides tucked away), 5 Luggage, 6 Payment
 * (contribution/sponsored per passenger, deposit/waiver, totals). Every
 * party value is written onto each TravellerRow, so pricing (computeFare)
 * and the booking payload are unchanged.
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
  legs = 1,
}: BookingFormPanelProps) {
  const depositAmount = depositDefaults?.[currency] ?? null;
  // Rows given their own pickup/drop-off; party changes leave them alone.
  const [ownAddress, setOwnAddress] = useState<string[]>([]);
  const partyRow = travellers.find((r) => !ownAddress.includes(r.key)) ?? travellers[0];

  function updateRow(key: string, patch: Partial<TravellerRow>) {
    onChange(travellers.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function updateAll(patch: Partial<TravellerRow>) {
    onChange(travellers.map((row) => ({ ...row, ...patch })));
  }

  // --- 3 Who's travelling -------------------------------------------------
  const counts = countByCategory(travellers);

  function setCategoryCount(category: PassengerCategory, next: number) {
    const current = counts[category];
    if (next > current) {
      onChange([...travellers, newPartyRow(category, currency, partyRow)]);
    } else if (next < current) {
      const index = removableIndex(travellers, category);
      if (index >= 0) onChange(travellers.filter((_, i) => i !== index));
    }
  }

  function removeRow(key: string) {
    onChange(travellers.filter((row) => row.key !== key));
  }

  // --- 4 Pick-up & drop-off -----------------------------------------------
  function setPartyAddress(which: "pickup" | "dropoff", option: AddressOption) {
    const patch =
      which === "pickup"
        ? { pickupAddressId: option.id, pickupLabel: addressLabel(option), pickupSnapshot: snapshotFor(option) }
        : { dropoffAddressId: option.id, dropoffLabel: addressLabel(option), dropoffSnapshot: snapshotFor(option) };
    onChange(travellers.map((row) => (ownAddress.includes(row.key) ? row : { ...row, ...patch })));
  }

  function setOwnRowAddress(key: string, which: "pickup" | "dropoff", option: AddressOption) {
    const patch =
      which === "pickup"
        ? { pickupAddressId: option.id, pickupLabel: addressLabel(option), pickupSnapshot: snapshotFor(option) }
        : { dropoffAddressId: option.id, dropoffLabel: addressLabel(option), dropoffSnapshot: snapshotFor(option) };
    updateRow(key, patch);
    if (!ownAddress.includes(key)) setOwnAddress([...ownAddress, key]);
  }

  function backToPartyAddress(key: string) {
    setOwnAddress(ownAddress.filter((k) => k !== key));
    const source = travellers.find((r) => r.key !== key && !ownAddress.includes(r.key));
    if (!source) return;
    updateRow(key, {
      pickupAddressId: source.pickupAddressId,
      pickupLabel: source.pickupLabel,
      pickupSnapshot: source.pickupSnapshot,
      dropoffAddressId: source.dropoffAddressId,
      dropoffLabel: source.dropoffLabel,
      dropoffSnapshot: source.dropoffSnapshot,
    });
  }

  const wheelchairCount = travellers.filter((r) => r.wheelchairSpace).length;

  // --- 6 Payment ----------------------------------------------------------
  const fares = travellers.map((row) => {
    const tariff = pickTariff(tariffs, row.category, direction);
    return tariff
      ? fareFor(row, tariff, currency)
      : null;
  });
  const totals = fares.reduce(
    (t, f) =>
      f
        ? {
            notional: t.notional + f.notionalFare,
            contribution: t.contribution + f.contribution,
            sponsored: t.sponsored + f.sponsored,
            subsidy: t.subsidy + f.subsidy,
            luggage: t.luggage + f.luggageCharge,
          }
        : t,
    { notional: 0, contribution: 0, sponsored: 0, subsidy: 0, luggage: 0 }
  );
  const invalidRows = fares.map((f, i) => (f && !f.isValid ? i : -1)).filter((i) => i >= 0);
  const noTariff = hasDeparture ? travellers.filter((_, i) => !fares[i]) : [];
  const depositsDue = travellers.filter((t) => !t.depositWaived && !t.standingWaiver).length;
  const waivable = travellers.filter((t) => !t.standingWaiver);
  const allWaived = waivable.length > 0 && waivable.every((t) => t.depositWaived);
  const sharedContribution = sharedValue(travellers, (r) => r.contribution);
  const sharedSponsored = sharedValue(travellers, (r) => r.sponsored);

  function money(value: string): number {
    return Math.max(0, Number(value) || 0);
  }

  return (
    <>
      <Card step={3} title="Who's travelling" action={<span className="text-sm text-slate-500">{travellers.length} in total</span>}>
        <div className="grid grid-cols-1 gap-x-6 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
          {CATEGORY_OPTIONS.map((c) => (
            <StepperRow
              key={c.value}
              label={c.label}
              hint={(() => {
                // Per-head price from the price list (Settings → Price list).
                const t = hasDeparture ? pickTariff(tariffs, c.value, direction) : null;
                const base = t ? (currency === "GBP" ? t.base_fare_gbp : t.base_fare_eur) : null;
                const price = base == null ? null : base === 0 ? "Free" : `${formatMoney(base, currency)} each`;
                const extra = c.value === "infant" ? "on a lap — no seat" : null;
                return [price, extra].filter(Boolean).join(" · ") || undefined;
              })()}
            >
              <Stepper
                label={c.label}
                value={counts[c.value]}
                max={30}
                minusDisabled={removableIndex(travellers, c.value) < 0}
                onChange={(n) => setCategoryCount(c.value, n)}
              />
            </StepperRow>
          ))}
        </div>

        {hasDeparture && travellers.length > 0 && (
          <p className="mt-2 flex items-baseline justify-between border-t border-slate-100 pt-2 text-sm">
            <span className="text-slate-600">
              Fares{legs > 1 ? " (return, both legs)" : ""}
            </span>
            <span className="text-base font-semibold text-slate-900">{formatMoney(totals.notional * legs, currency)}</span>
          </p>
        )}

        <Disclosure summary="Add names (optional)">
          <p className="text-xs text-slate-500">
            Blank names are saved as the caller&apos;s surname + &ldquo;family&rdquo; and can be changed later.
          </p>
          <ul className="space-y-2">
            {travellers.map((row, index) => (
              <li key={row.key} className="flex flex-wrap items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs text-slate-500">{index + 1}</span>
                <input
                  value={row.passengerName}
                  onChange={(e) =>
                    // Renaming detaches the row from a matched passenger record;
                    // a new passenger is created at Reserve time.
                    updateRow(row.key, { passengerName: e.target.value, passengerId: null, standingWaiver: false })
                  }
                  placeholder={index === 0 ? "Caller or first passenger" : "Name (optional)"}
                  aria-label={`Passenger ${index + 1} name`}
                  className={`${inputClass} min-w-0 flex-1 basis-40`}
                />
                <select
                  value={row.category}
                  aria-label={`Passenger ${index + 1} category`}
                  onChange={(e) => {
                    const category = e.target.value as PassengerCategory;
                    updateRow(row.key, { category, occupiesSeat: defaultOccupiesSeat(category) });
                  }}
                  className={`${inputClass} w-auto`}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <label className="flex min-h-11 items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.occupiesSeat}
                    onChange={(e) => updateRow(row.key, { occupiesSeat: e.target.checked })}
                    className="h-4 w-4"
                  />
                  Seat
                </label>
                {travellers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    aria-label={`Remove passenger ${index + 1}`}
                    className="h-11 w-11 rounded-lg text-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ×
                  </button>
                )}
                {row.passengerId && (
                  <span className="basis-full pl-7 text-xs text-slate-500">Linked to an existing passenger record.</span>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onChange([...travellers, newPartyRow("man", currency, partyRow)])}
            className={outlineButtonClass}
          >
            + Add passenger
          </button>
        </Disclosure>
      </Card>

      <Card step={4} title="Pick-up & drop-off">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <AddressAutocomplete
            label={travellers.length > 1 ? "Pickup (everyone)" : "Pickup"}
            value={partyRow?.pickupLabel ?? ""}
            areas={areas}
            suggestions={addressSuggestions}
            onSelect={(option: AddressOption) => setPartyAddress("pickup", option)}
          />
          <AddressAutocomplete
            label={travellers.length > 1 ? "Drop-off (everyone)" : "Drop-off"}
            value={partyRow?.dropoffLabel ?? ""}
            areas={areas}
            suggestions={addressSuggestions}
            onSelect={(option: AddressOption) => setPartyAddress("dropoff", option)}
          />
        </div>

        <div className="mt-3">
          <StepperRow label="Wheelchair spaces" hint={wheelchairCount ? undefined : "None needed"}>
            <Stepper
              label="wheelchair space"
              value={wheelchairCount}
              max={travellers.length}
              onChange={(n) => onChange(setWheelchairCount(travellers, n))}
            />
          </StepperRow>
        </div>

        <Disclosure summary="Different address or needs for someone">
          {travellers.map((row, index) => {
            const own = ownAddress.includes(row.key);
            return (
              <div key={row.key} className="space-y-2 rounded-lg bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{passengerTitle(row, index)}</p>
                  {own && (
                    <button type="button" onClick={() => backToPartyAddress(row.key)} className={outlineButtonClass}>
                      Same as everyone
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <AddressAutocomplete
                    label="Pickup"
                    value={row.pickupLabel}
                    areas={areas}
                    suggestions={addressSuggestions}
                    onSelect={(option: AddressOption) => setOwnRowAddress(row.key, "pickup", option)}
                  />
                  <AddressAutocomplete
                    label="Drop-off"
                    value={row.dropoffLabel}
                    areas={areas}
                    suggestions={addressSuggestions}
                    onSelect={(option: AddressOption) => setOwnRowAddress(row.key, "dropoff", option)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={row.wheelchairSpace}
                      onChange={(e) => updateRow(row.key, { wheelchairSpace: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Wheelchair space
                  </label>
                  <input
                    value={row.mobilityNeeds}
                    onChange={(e) => updateRow(row.key, { mobilityNeeds: e.target.value })}
                    placeholder="Mobility needs (optional)"
                    aria-label={`${passengerTitle(row, index)} mobility needs`}
                    className={`${inputClass} min-w-0 flex-1 basis-48`}
                  />
                </div>
              </div>
            );
          })}
        </Disclosure>
      </Card>

      <Card step={5} title="Luggage" action={<span className="text-sm text-slate-500">whole party</span>}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-4">
          {LUGGAGE.map(({ kind, label }) => {
            const total = travellers.reduce((sum, r) => sum + r.luggage[kind], 0);
            return (
              <div key={kind} className="flex flex-col items-start gap-1">
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <Stepper
                  label={`${label.toLowerCase()} bag`}
                  value={total}
                  onChange={(n) => onChange(adjustLuggage(travellers, kind, n > total ? 1 : -1))}
                />
              </div>
            );
          })}
        </div>
        {travellers.length > 1 && (
          <Disclosure summary="Per passenger">
            <p className="text-xs text-slate-500">The party totals above are shared out evenly; adjust anyone here.</p>
            {travellers.map((row, index) => (
              <div key={row.key} className="rounded-lg bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium text-slate-800">{passengerTitle(row, index)}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-4">
                  {LUGGAGE.map(({ kind, label }) => (
                    <div key={kind} className="flex flex-col items-start gap-1">
                      <p className="text-xs text-slate-600">{label}</p>
                      <Stepper
                        label={`${label.toLowerCase()} bag for ${passengerTitle(row, index)}`}
                        value={row.luggage[kind]}
                        onChange={(n) => updateRow(row.key, { luggage: { ...row.luggage, [kind]: n } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Disclosure>
        )}
      </Card>

      <Card
        step={6}
        title="Payment"
        action={
          <select
            id="booking-currency"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            aria-label="Currency"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="GBP">GBP £</option>
            <option value="EUR">EUR €</option>
          </select>
        }
      >
        {tariffError && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
            Couldn&apos;t load fares for this route: {tariffError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-700">
            Contribution <span className="font-normal text-slate-500">each</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={sharedContribution ?? ""}
              placeholder={travellers.every((t) => t.contribution == null) ? "Full fare" : "Varies"}
              onChange={(e) => updateAll({ contribution: e.target.value === "" ? null : money(e.target.value) })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sponsored <span className="font-normal text-slate-500">each</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={sharedSponsored ?? ""}
              placeholder={sharedSponsored == null ? "Varies" : undefined}
              onChange={(e) => updateAll({ sponsored: money(e.target.value) })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>

        <div
          className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
            depositsDue === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className={depositsDue === 0 ? "text-green-800" : "text-amber-900"}>
            <span className="font-medium">Deposit:</span>{" "}
            {depositsDue === 0
              ? travellers.some((t) => t.standingWaiver) && waivable.length === 0
                ? "waived (standing waiver)"
                : "waived"
              : depositAmount != null
                ? `${formatMoney(depositAmount, currency)} × ${depositsDue} = ${formatMoney(depositAmount * depositsDue, currency)}`
                : `${depositsDue} required (amount not configured)`}
          </p>
          {waivable.length > 0 && (
            <label className="flex min-h-11 items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={allWaived}
                onChange={(e) =>
                  onChange(travellers.map((t) => (t.standingWaiver ? t : { ...t, depositWaived: e.target.checked })))
                }
                className="h-4 w-4"
              />
              Waive deposit
            </label>
          )}
        </div>

        {hasDeparture && (
          <div
            className={`mt-3 rounded-lg p-2 text-sm ${invalidRows.length ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"}`}
          >
            {(() => {
              // Bin-booking style receipt (owner, 1 Oct 2026). Prices come
              // from the price list; the charity covers what the passenger
              // and any sponsor don't.
              const L = legs;
              const line = (label: string, value: number, cls = "") => (
                <p className={`flex justify-between gap-3 ${cls}`}>
                  <span>{label}</span>
                  <span className="tabular-nums">{formatMoney(value, currency)}</span>
                </p>
              );
              const deposits = depositAmount != null ? depositAmount * depositsDue : 0;
              return (
                <div className="space-y-1">
                  {line(`Fares${L > 1 ? " × 2 legs" : ""}`, (totals.notional - totals.luggage) * L)}
                  {totals.luggage > 0 && line("Extra luggage", totals.luggage * L)}
                  {totals.sponsored > 0 && line("Sponsored", -totals.sponsored * L, "text-emerald-700")}
                  {totals.subsidy > 0 && line("Charity covers", -totals.subsidy * L, "text-emerald-700")}
                  <div className="my-1 border-t border-slate-200" />
                  {line("Passenger pays", totals.contribution * L, "font-semibold text-slate-900")}
                  {deposits > 0 && line("Deposit (refundable)", deposits)}
                  <div className="my-1 border-t border-slate-300" />
                  {line("Total to collect", totals.contribution * L + deposits, "text-base font-bold text-slate-900")}
                  <p className="pt-1 text-xs text-slate-500">
                    Prices from the{" "}
                    <a href="/office/tariffs" className="underline">
                      price list
                    </a>
                    .
                  </p>
                </div>
              );
            })()}
            {invalidRows.length > 0 && (
              <p className="mt-1">
                Contribution + sponsored is more than the fare for{" "}
                {invalidRows.map((i) => passengerTitle(travellers[i], i)).join(", ")}.
              </p>
            )}
            {noTariff.length > 0 && (
              <p className="mt-1 text-slate-500">
                No tariff for {[...new Set(noTariff.map((r) => categoryLabel(r.category).toLowerCase()))].join(", ")} on
                this route — recorded as 0.
              </p>
            )}
          </div>
        )}

        <Disclosure summary="Per passenger amounts">
          {travellers.map((row, index) => {
            const fare = fares[index];
            const waived = row.depositWaived || row.standingWaiver;
            return (
              <div key={row.key} className="space-y-2 rounded-lg bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{passengerTitle(row, index)}</p>
                  <label className="flex min-h-9 items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={waived}
                      disabled={row.standingWaiver}
                      onChange={(e) => updateRow(row.key, { depositWaived: e.target.checked })}
                      className="h-4 w-4"
                    />
                    {row.standingWaiver ? "Standing waiver" : "Waive deposit"}
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-600">
                    Contribution
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={row.contribution ?? ""}
                      placeholder="Full fare"
                      onChange={(e) =>
                        updateRow(row.key, { contribution: e.target.value === "" ? null : money(e.target.value) })
                      }
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Sponsored
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={row.sponsored}
                      onChange={(e) => updateRow(row.key, { sponsored: money(e.target.value) })}
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                </div>
                {fare && (
                  <p className={`text-xs ${fare.isValid ? "text-slate-600" : "text-red-700"}`}>
                    Notional {formatMoney(fare.notionalFare, currency)} = {fare.contribution.toFixed(2)} +{" "}
                    {fare.sponsored.toFixed(2)} + subsidy {fare.subsidy.toFixed(2)}
                    {fare.luggageCharge > 0 && ` (luggage ${fare.luggageCharge.toFixed(2)})`}
                  </p>
                )}
              </div>
            );
          })}
        </Disclosure>
      </Card>
    </>
  );
}
