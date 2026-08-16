"use client";

import { useEffect, useState } from "react";
import { PassengerLookupPanel, type PassengerSummary } from "./PassengerLookupPanel";
import { DepartureInfoPanel, type DepartureOption } from "./DepartureInfoPanel";
import { BookingFormPanel, pickTariff, type TariffRow } from "./BookingFormPanel";
import { emptyTravellerRow, type TravellerRow } from "./types";
import { computeFare } from "@/lib/tariffs/computeFare";
import { listTariffsForRoute } from "@/app/actions/tariffs";
import { createPassenger } from "@/app/actions/passengers";
import { createProvisionalTripBooking } from "@/app/actions/bookings";
import { sendBookingConfirmation } from "@/app/actions/notifications";
import type { Currency } from "@/types/database";

interface BookingConsoleProps {
  initialDepartures: DepartureOption[];
}

/**
 * Build spec §32: the Office Booking Console — one screen, no wizard, no
 * page transitions, because the operator is talking to someone while using
 * it. Orchestrates the three panels and calls createProvisionalTripBooking
 * — the single action that reserves capacity — from one Reserve button.
 */
export function BookingConsole({ initialDepartures }: BookingConsoleProps) {
  const [leadPassenger, setLeadPassenger] = useState<PassengerSummary | null>(null);
  const [outboundId, setOutboundId] = useState<string | null>(null);
  const [returnEnabled, setReturnEnabled] = useState(false);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [travellers, setTravellers] = useState<TravellerRow[]>([emptyTravellerRow("GBP")]);
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [tariffsByRoute, setTariffsByRoute] = useState<Record<string, TariffRow[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  const outbound = initialDepartures.find((d) => d.id === outboundId) ?? null;
  const returnDeparture = initialDepartures.find((d) => d.id === returnId) ?? null;

  // Pre-fills the first traveller row with the selected caller, so the
  // common case (caller is travelling) needs no extra typing. Done as part
  // of the selection handler itself rather than a useEffect watching
  // leadPassenger — both state updates belong to the same user action, so
  // there's no reason to route it through an extra render pass.
  function handleSelectLeadPassenger(passenger: PassengerSummary | null) {
    setLeadPassenger(passenger);
    if (!passenger) return;
    setTravellers((rows) => {
      if (rows.length === 0) return [emptyTravellerRow(currency)];
      const [first, ...rest] = rows;
      if (first.passengerId) return rows; // don't overwrite a manually-edited row
      return [
        {
          ...first,
          passengerId: passenger.id,
          passengerName: passenger.full_name,
          category: passenger.category,
        },
        ...rest,
      ];
    });
  }

  useEffect(() => {
    async function loadTariffs(routeId: string) {
      if (tariffsByRoute[routeId]) return;
      const { tariffs } = await listTariffsForRoute(routeId);
      setTariffsByRoute((prev) => ({ ...prev, [routeId]: (tariffs ?? []) as TariffRow[] }));
    }
    if (outbound) loadTariffs(outbound.route_id);
    if (returnDeparture) loadTariffs(returnDeparture.route_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbound?.route_id, returnDeparture?.route_id]);

  async function handleSubmit() {
    setResult(null);
    if (!leadPassenger) {
      setResult({ error: "Select or create a caller first." });
      return;
    }
    if (!outbound) {
      setResult({ error: "Select a departure." });
      return;
    }
    if (returnEnabled && !returnDeparture) {
      setResult({ error: "Select a return departure, or turn off the return leg." });
      return;
    }
    if (travellers.some((t) => !t.passengerName.trim())) {
      setResult({ error: "Every passenger needs a name." });
      return;
    }

    setSubmitting(true);
    try {
      // Resolve a passenger_id for any row that doesn't have one yet
      // (operator typed a name without searching/selecting) — the DB
      // requires booking_passengers.passenger_id to reference a real row.
      const resolvedTravellers: TravellerRow[] = [];
      for (const row of travellers) {
        if (row.passengerId) {
          resolvedTravellers.push(row);
          continue;
        }
        const { id, error } = await createPassenger({
          full_name: row.passengerName,
          category: row.category,
          created_via: "phone",
        });
        if (error || !id) {
          setResult({ error: error ?? "Could not create passenger." });
          setSubmitting(false);
          return;
        }
        resolvedTravellers.push({ ...row, passengerId: id });
      }

      const outboundTariffs = tariffsByRoute[outbound.route_id] ?? [];
      const outboundPassengers = resolvedTravellers.map((row) => {
        const tariff = pickTariff(outboundTariffs, row.category, outbound.direction as "outbound" | "return");
        const fare = tariff
          ? computeFare({ tariff, currency, luggage: row.luggage, contribution: row.contribution, sponsored: row.sponsored })
          : {
              notionalFare: 0,
              contribution: 0,
              sponsored: 0,
              subsidy: 0,
              luggageCharge: 0,
              luggageUnitsConsumed: 0,
              isValid: true,
            };
        const depositWaived = row.depositWaived || leadPassenger.deposit_waiver_standing;
        return {
          passenger_id: row.passengerId!,
          category: row.category,
          occupies_seat: row.occupiesSeat,
          pickup_address_id: row.pickupAddressId,
          dropoff_address_id: row.dropoffAddressId,
          pickup_address_snapshot: row.pickupSnapshot,
          dropoff_address_snapshot: row.dropoffSnapshot,
          mobility_needs: row.mobilityNeeds || null,
          wheelchair_space: row.wheelchairSpace,
          currency,
          notional_fare: fare.notionalFare,
          contribution: fare.contribution,
          sponsored: fare.sponsored,
          subsidy: fare.subsidy,
          deposit_required: !depositWaived,
          deposit_status: depositWaived ? ("waived" as const) : ("required" as const),
          luggage_large: row.luggage.large,
          luggage_small: row.luggage.small,
          luggage_hand: row.luggage.hand,
          luggage_oversize: row.luggage.oversize,
          luggage_units_consumed: fare.luggageUnitsConsumed,
          luggage_charge: fare.luggageCharge,
          status: "provisional" as const,
        };
      });

      let returnPassengers: typeof outboundPassengers | null = null;
      if (returnEnabled && returnDeparture) {
        const returnTariffs = tariffsByRoute[returnDeparture.route_id] ?? [];
        returnPassengers = resolvedTravellers.map((row) => {
          const tariff = pickTariff(returnTariffs, row.category, returnDeparture.direction as "outbound" | "return");
          const fare = tariff
            ? computeFare({ tariff, currency, luggage: row.luggage, contribution: row.contribution, sponsored: row.sponsored })
            : {
                notionalFare: 0,
                contribution: 0,
                sponsored: 0,
                subsidy: 0,
                luggageCharge: 0,
                luggageUnitsConsumed: 0,
                isValid: true,
              };
          const depositWaived = row.depositWaived || leadPassenger.deposit_waiver_standing;
          return {
            passenger_id: row.passengerId!,
            category: row.category,
            occupies_seat: row.occupiesSeat,
            // Return leg reuses the same pickup/dropoff pair reversed is a
            // reasonable Phase 1 default but not assumed here — left blank
            // for Office to fill in on the return departure's own stops
            // once Phase 2 dispatch exists; Phase 1 just needs the row to
            // exist.
            pickup_address_id: row.dropoffAddressId,
            dropoff_address_id: row.pickupAddressId,
            pickup_address_snapshot: row.dropoffSnapshot,
            dropoff_address_snapshot: row.pickupSnapshot,
            mobility_needs: row.mobilityNeeds || null,
            wheelchair_space: row.wheelchairSpace,
            currency,
            notional_fare: fare.notionalFare,
            contribution: fare.contribution,
            sponsored: fare.sponsored,
            subsidy: fare.subsidy,
            deposit_required: !depositWaived,
            deposit_status: depositWaived ? ("waived" as const) : ("required" as const),
            luggage_large: row.luggage.large,
            luggage_small: row.luggage.small,
            luggage_hand: row.luggage.hand,
            luggage_oversize: row.luggage.oversize,
            luggage_units_consumed: fare.luggageUnitsConsumed,
            luggage_charge: fare.luggageCharge,
            status: "provisional" as const,
          };
        });
      }

      const { result: rpcResult, error } = await createProvisionalTripBooking({
        leadPassengerId: leadPassenger.id,
        outbound: { departure_id: outbound.id, channel: "phone", booking_passengers: outboundPassengers },
        return: returnPassengers
          ? { departure_id: returnDeparture!.id, channel: "phone", booking_passengers: returnPassengers }
          : null,
      });

      if (error || !rpcResult) {
        setResult({ error: error ?? "Booking failed." });
        setSubmitting(false);
        return;
      }

      await sendBookingConfirmation(rpcResult.outbound.booking_id);
      setResult({ message: `Booked — reference ${rpcResult.reference}.` });
      setTravellers([emptyTravellerRow(currency)]);
    } finally {
      setSubmitting(false);
    }
  }

  const outboundTariffs = outbound ? tariffsByRoute[outbound.route_id] ?? [] : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <PassengerLookupPanel selected={leadPassenger} onSelect={handleSelectLeadPassenger} />

      <div className="space-y-4">
        <DepartureInfoPanel
          label="Outbound departure"
          departures={initialDepartures}
          selectedId={outboundId}
          onSelect={(d) => setOutboundId(d?.id ?? null)}
        />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={returnEnabled}
            onChange={(e) => setReturnEnabled(e.target.checked)}
          />
          Book a return too
        </label>

        {returnEnabled && (
          <DepartureInfoPanel
            label="Return departure"
            departures={initialDepartures}
            selectedId={returnId}
            onSelect={(d) => setReturnId(d?.id ?? null)}
          />
        )}
      </div>

      <div className="lg:col-span-3">
        <BookingFormPanel
          travellers={travellers}
          onChange={setTravellers}
          tariffs={outboundTariffs}
          direction={(outbound?.direction as "outbound" | "return") ?? "outbound"}
          currency={currency}
          onCurrencyChange={setCurrency}
        />
      </div>

      <div className="lg:col-span-3">
        {result?.error && (
          <p className="mb-3 rounded bg-red-50 p-3 text-sm text-red-700">{result.error}</p>
        )}
        {result?.message && (
          <p className="mb-3 rounded bg-green-50 p-3 text-sm text-green-700">{result.message}</p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded bg-brand-dark py-3 text-lg font-semibold text-white disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {submitting ? "Reserving..." : "Reserve"}
        </button>
      </div>
    </div>
  );
}
