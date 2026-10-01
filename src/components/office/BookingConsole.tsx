"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PassengerLookupPanel, type PassengerSummary } from "./PassengerLookupPanel";
import { DepartureInfoPanel, departureOptionLabel, type DepartureOption } from "./DepartureInfoPanel";
import { BookingFormPanel, pickTariff, snapshotFor, type TariffRow } from "./BookingFormPanel";
import { addressLabel, type AddressOption, type AddressSuggestion, type AreaOption } from "./AddressAutocomplete";
import { emptyTravellerRow, type DepositDefaults, type TravellerRow } from "./types";
import { CallOutcomePanel, outcomeLabel, type LoggedCall } from "./booking/CallOutcomePanel";
import { capacityMessage, isWaitlistable, parseCapacityCode, type WaitlistableCode } from "./booking/capacityMessages";
import { journeyKey, oppositeDirection, ukDayKey } from "./booking/departureDays";
import { Card } from "./booking/ui";
import { computeFare } from "@/lib/tariffs/computeFare";
import { listTariffsForRoute } from "@/app/actions/tariffs";
import { createPassenger } from "@/app/actions/passengers";
import { createProvisionalTripBooking } from "@/app/actions/bookings";
import { sendBookingConfirmation } from "@/app/actions/notifications";
import { getAddressesByIds } from "@/app/actions/addresses";
import { addToWaitlist } from "@/app/actions/waitlist";
import { logCall, updateCallLog } from "@/app/actions/callLogs";
import type { BookingPassengerInput, CallOutcome, Currency, DepartureDirection } from "@/types/database";

interface BookingConsoleProps {
  initialDepartures: DepartureOption[];
  areas?: AreaOption[];
  depositDefaults?: DepositDefaults;
  /** Preselected from ?departure= (the departure page's "Book a passenger"). */
  initialDepartureId?: string | null;
}

interface CallerDefaults {
  pickup: AddressOption | null;
  dropoff: AddressOption | null;
}

interface LastBooking {
  reference: string;
  legs: { departureId: string; label: string }[];
  warning: string | null;
}

interface CapacityFailure {
  code: WaitlistableCode;
  message: string;
  legs: { departureId: string; label: string; legName: string }[];
  /** departure ids already added to the waitlist for this failure */
  waitlisted: string[];
}

const NO_DEFAULTS: CallerDefaults = { pickup: null, dropoff: null };

/** First traveller row pre-filled from the caller — the common case is the
 * caller travelling, so it needs no extra typing. */
function callerRow(passenger: PassengerSummary, defaults: CallerDefaults, currency: Currency): TravellerRow {
  const row = emptyTravellerRow(currency);
  row.passengerId = passenger.id;
  row.passengerName = passenger.full_name;
  row.category = passenger.category;
  row.occupiesSeat = passenger.category !== "infant";
  row.standingWaiver = passenger.deposit_waiver_standing;
  return applyDefaults(row, defaults);
}

function applyDefaults(row: TravellerRow, defaults: CallerDefaults): TravellerRow {
  const next = { ...row };
  if (!next.pickupAddressId && defaults.pickup) {
    next.pickupAddressId = defaults.pickup.id;
    next.pickupLabel = addressLabel(defaults.pickup);
    next.pickupSnapshot = snapshotFor(defaults.pickup);
  }
  if (!next.dropoffAddressId && defaults.dropoff) {
    next.dropoffAddressId = defaults.dropoff.id;
    next.dropoffLabel = addressLabel(defaults.dropoff);
    next.dropoffSnapshot = snapshotFor(defaults.dropoff);
  }
  return next;
}

/**
 * Build spec §32: the Office Booking Console — one screen, no wizard, no
 * page transitions, because the operator is talking to someone while using
 * it. Orchestrates the caller / departure / booking panels, calls
 * createProvisionalTripBooking (the single action that reserves capacity)
 * from one Reserve button, offers the waitlist when capacity runs out
 * (§13) and logs the call outcome (§38).
 */
export function BookingConsole({
  initialDepartures,
  areas = [],
  depositDefaults,
  initialDepartureId = null,
}: BookingConsoleProps) {
  const router = useRouter();
  const [leadPassenger, setLeadPassenger] = useState<PassengerSummary | null>(null);
  const [callerDefaults, setCallerDefaults] = useState<CallerDefaults>(NO_DEFAULTS);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [outboundId, setOutboundId] = useState<string | null>(
    initialDepartures.some((d) => d.id === initialDepartureId) ? initialDepartureId : null
  );
  const [returnEnabled, setReturnEnabled] = useState(false);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [travellers, setTravellers] = useState<TravellerRow[]>([emptyTravellerRow("GBP")]);
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [tariffsByRoute, setTariffsByRoute] = useState<Record<string, TariffRow[]>>({});
  const [tariffErrors, setTariffErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBooking, setLastBooking] = useState<LastBooking | null>(null);
  const [capacityFailure, setCapacityFailure] = useState<CapacityFailure | null>(null);
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [callLog, setCallLog] = useState<LoggedCall[]>([]);
  const [callBusy, setCallBusy] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  // The call_logs row for the call in progress: created on the first
  // outcome, then updated in place (auto-save) as things change.
  const [callId, setCallId] = useState<string | null>(null);
  const [callNotes, setCallNotes] = useState("");
  const [callRound, setCallRound] = useState(0);

  const outbound = initialDepartures.find((d) => d.id === outboundId) ?? null;
  const returnDeparture = initialDepartures.find((d) => d.id === returnId) ?? null;

  const addressSuggestions: AddressSuggestion[] = [];
  if (callerDefaults.pickup) addressSuggestions.push({ tag: "Caller pickup", address: callerDefaults.pickup });
  if (callerDefaults.dropoff && callerDefaults.dropoff.id !== callerDefaults.pickup?.id) {
    addressSuggestions.push({ tag: "Caller drop-off", address: callerDefaults.dropoff });
  }

  async function handleSelectLeadPassenger(passenger: PassengerSummary | null) {
    const previous = leadPassenger;
    setLeadPassenger(passenger);
    setCallerDefaults(NO_DEFAULTS);
    setDefaultsError(null);
    setError(null);
    setCapacityFailure(null);
    if (!passenger) return;

    // Pre-fill the first traveller row with the caller unless the operator
    // has already typed someone else into it.
    setTravellers((rows) => {
      const [first, ...rest] = rows.length ? rows : [emptyTravellerRow(currency)];
      const replaceable = !first.passengerName.trim() || (previous && first.passengerId === previous.id);
      return replaceable ? [callerRow(passenger, NO_DEFAULTS, currency), ...rest] : rows;
    });

    const ids = [passenger.default_pickup_address_id, passenger.default_dropoff_address_id].filter(
      (id): id is string => Boolean(id)
    );
    if (ids.length === 0) return;
    const res = await getAddressesByIds(ids);
    if (res.error) {
      setDefaultsError(res.error);
      return;
    }
    const byId = new Map((res.addresses as AddressOption[]).map((a) => [a.id, a]));
    const defaults: CallerDefaults = {
      pickup: passenger.default_pickup_address_id ? byId.get(passenger.default_pickup_address_id) ?? null : null,
      dropoff: passenger.default_dropoff_address_id ? byId.get(passenger.default_dropoff_address_id) ?? null : null,
    };
    setCallerDefaults(defaults);
    setTravellers((rows) =>
      // The party shares the caller's addresses: fill any row that has none yet.
      rows.map((row) => applyDefaults(row, defaults))
    );
  }

  useEffect(() => {
    async function loadTariffs(routeId: string) {
      if (tariffsByRoute[routeId]) return;
      const res = await listTariffsForRoute(routeId);
      if (res.error) {
        setTariffErrors((prev) => ({ ...prev, [routeId]: res.error as string }));
        return;
      }
      setTariffErrors((prev) => {
        const next = { ...prev };
        delete next[routeId];
        return next;
      });
      setTariffsByRoute((prev) => ({ ...prev, [routeId]: (res.tariffs ?? []) as TariffRow[] }));
    }
    if (outbound) loadTariffs(outbound.route_id);
    if (returnDeparture) loadTariffs(returnDeparture.route_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbound?.route_id, returnDeparture?.route_id]);

  async function recordCall(outcome: CallOutcome, notes: string | null, auto: boolean) {
    setCallBusy(true);
    setCallError(null);
    const fields = {
      outcome,
      matchedPassengerId: leadPassenger?.id ?? null,
      fromNumber: leadPassenger?.phone ?? null,
      notes: (notes ?? callNotes).trim() || null,
    };
    const res: { error?: string; id?: string } = callId
      ? await updateCallLog(callId, fields)
      : await logCall(fields);
    setCallBusy(false);
    if (res.error) {
      setCallError(res.error);
      return false;
    }
    if (!callId && res.id) setCallId(res.id);
    setCallLog([{ outcome, at: new Date().toISOString(), auto }]);
    return true;
  }

  async function saveCallNotes(notes: string) {
    setCallNotes(notes);
    if (!callId) return; // saved with the outcome when one is chosen
    setCallBusy(true);
    const res = await updateCallLog(callId, { notes: notes.trim() || null });
    setCallBusy(false);
    setCallError(res.error ?? null);
  }

  function startNewCall() {
    setLeadPassenger(null);
    setCallerDefaults(NO_DEFAULTS);
    setDefaultsError(null);
    setTravellers([emptyTravellerRow(currency)]);
    setReturnEnabled(false);
    setReturnId(null);
    setError(null);
    setLastBooking(null);
    setCapacityFailure(null);
    setWaitlistError(null);
    setCallLog([]);
    setCallError(null);
    setCallId(null);
    setCallNotes("");
    setCallRound((n) => n + 1);
    setCallRound((n) => n + 1);
  }

  function buildLeg(rows: TravellerRow[], departure: DepartureOption, reversed: boolean): BookingPassengerInput[] {
    const tariffs = tariffsByRoute[departure.route_id] ?? [];
    return rows.map((row) => {
      const tariff = pickTariff(tariffs, row.category, departure.direction as DepartureDirection);
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
      const depositWaived = row.depositWaived || row.standingWaiver;
      return {
        passenger_id: row.passengerId!,
        category: row.category,
        occupies_seat: row.occupiesSeat,
        // The return leg swaps pickup and drop-off (home → coach → home).
        pickup_address_id: reversed ? row.dropoffAddressId : row.pickupAddressId,
        dropoff_address_id: reversed ? row.pickupAddressId : row.dropoffAddressId,
        pickup_address_snapshot: reversed ? row.dropoffSnapshot : row.pickupSnapshot,
        dropoff_address_snapshot: reversed ? row.pickupSnapshot : row.dropoffSnapshot,
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

  function invalidFareRow(departure: DepartureOption): number {
    const tariffs = tariffsByRoute[departure.route_id] ?? [];
    return travellers.findIndex((row) => {
      const tariff = pickTariff(tariffs, row.category, departure.direction as DepartureDirection);
      if (!tariff) return false;
      return !computeFare({ tariff, currency, luggage: row.luggage, contribution: row.contribution, sponsored: row.sponsored })
        .isValid;
    });
  }

  async function handleSubmit() {
    setError(null);
    setCapacityFailure(null);
    setWaitlistError(null);
    setLastBooking(null);
    if (!leadPassenger) return setError("Select or create a caller first.");
    if (!outbound) return setError("Select a departure.");
    if (returnEnabled && !returnDeparture) return setError("Select a return departure, or turn off the return leg.");
    if (returnEnabled && returnDeparture?.id === outbound.id) {
      return setError("The return departure can't be the same as the outbound one.");
    }
    if (returnEnabled && returnDeparture && returnDeparture.depart_at <= outbound.depart_at) {
      return setError("The return departure is before the outbound one. Pick a later return.");
    }
    if (travellers.length === 0) return setError("Add at least one passenger.");
    // Family members are often booked before anyone gives their names:
    // an unnamed row becomes "<caller's surname> family N", editable later
    // on the passenger's page.
    const surname = leadPassenger.full_name.trim().split(/\s+/).slice(-1)[0] || "Passenger";
    const named = travellers.map((t, i) =>
      t.passengerName.trim() ? t : { ...t, passengerName: `${surname} family ${i + 1}` }
    );
    for (const dep of [outbound, returnEnabled ? returnDeparture : null]) {
      if (!dep) continue;
      if (tariffErrors[dep.route_id]) return setError(`Fares for ${dep.routeName} didn't load: ${tariffErrors[dep.route_id]}`);
      const bad = invalidFareRow(dep);
      if (bad >= 0) return setError(`Passenger ${bad + 1}: contribution + sponsored is more than the fare.`);
    }

    setSubmitting(true);
    try {
      // Resolve a passenger_id for any row typed without searching. Written
      // back into state straight away so a retry after a failed Reserve
      // doesn't create the same passenger twice.
      const resolved: TravellerRow[] = [];
      for (const row of named) {
        if (row.passengerId) {
          resolved.push(row);
          continue;
        }
        const { id, error: createError } = await createPassenger({
          full_name: row.passengerName.trim(),
          category: row.category,
          created_via: "phone",
        });
        if (createError || !id) {
          setTravellers(named.map((t) => resolved.find((r) => r.key === t.key) ?? t));
          setError(`Couldn't create passenger "${row.passengerName}": ${createError ?? "unknown error"}`);
          return;
        }
        resolved.push({ ...row, passengerId: id });
      }
      setTravellers(resolved);

      const outboundPassengers = buildLeg(resolved, outbound, false);
      const returnPassengers = returnEnabled && returnDeparture ? buildLeg(resolved, returnDeparture, true) : null;

      const { result: rpcResult, error: bookingError } = await createProvisionalTripBooking({
        leadPassengerId: leadPassenger.id,
        outbound: { departure_id: outbound.id, channel: "phone", booking_passengers: outboundPassengers },
        return: returnPassengers
          ? { departure_id: returnDeparture!.id, channel: "phone", booking_passengers: returnPassengers }
          : null,
      });

      if (bookingError || !rpcResult) {
        const code = parseCapacityCode(bookingError);
        if (isWaitlistable(code)) {
          const legs = [{ departureId: outbound.id, label: departureOptionLabel(outbound), legName: "outbound" }];
          if (returnPassengers && returnDeparture) {
            legs.push({ departureId: returnDeparture.id, label: departureOptionLabel(returnDeparture), legName: "return" });
          }
          setCapacityFailure({ code, message: capacityMessage(code), legs, waitlisted: [] });
        } else if (code) {
          setError(capacityMessage(code));
        } else {
          setError(bookingError ?? "Booking failed.");
        }
        // Capacity numbers may have moved under us — show the live picture.
        setRefreshKey((k) => k + 1);
        router.refresh();
        return;
      }

      const confirmations = [rpcResult.outbound.booking_id, rpcResult.return?.booking_id].filter(
        (id): id is string => Boolean(id)
      );
      const warnings: string[] = [];
      for (const bookingId of confirmations) {
        const res = await sendBookingConfirmation(bookingId);
        if (res.error) warnings.push(res.error);
      }

      const legs = [{ departureId: outbound.id, label: departureOptionLabel(outbound, false) }];
      if (returnPassengers && returnDeparture) {
        legs.push({ departureId: returnDeparture.id, label: departureOptionLabel(returnDeparture, false) });
      }
      setLastBooking({
        reference: rpcResult.reference,
        legs,
        warning: warnings.length ? `Booking saved, but the confirmation wasn't sent: ${warnings.join("; ")}` : null,
      });

      // §38: log the call automatically the first time it produces a
      // booking. All deposits waived = capacity is secured ("booked"),
      // otherwise it's an unsecured provisional hold.
      if (callLog.length === 0) {
        const allWaived = resolved.every((r) => r.depositWaived || r.standingWaiver);
        await recordCall(allWaived ? "booked" : "provisional_created", `Ref ${rpcResult.reference}`, true);
      }

      // Ready for the next booking on the same call: keep the caller and
      // the departure, reset the passengers.
      setTravellers([callerRow(leadPassenger, callerDefaults, currency)]);
      setReturnEnabled(false);
      setReturnId(null);
      setRefreshKey((k) => k + 1);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWaitlist(departureId: string) {
    if (!leadPassenger || !capacityFailure) return;
    setWaitlistBusy(true);
    setWaitlistError(null);
    const seatsWanted = Math.max(1, travellers.filter((t) => t.occupiesSeat).length);
    const luggageEstimate = travellers.reduce(
      (sum, t) => sum + t.luggage.large + t.luggage.small + t.luggage.oversize,
      0
    );
    const res = await addToWaitlist({
      departureId,
      passengerId: leadPassenger.id,
      seatsWanted,
      luggageEstimate,
      wheelchairRequirement: travellers.some((t) => t.wheelchairSpace),
    });
    setWaitlistBusy(false);
    if (res.error) {
      setWaitlistError(res.error);
      return;
    }
    setCapacityFailure((f) => (f ? { ...f, waitlisted: [...f.waitlisted, departureId] } : f));
    if (!callLog.some((c) => c.outcome === "waitlisted")) {
      await recordCall("waitlisted", `Seats wanted ${seatsWanted}`, true);
    }
  }

  const outboundTariffs = outbound ? tariffsByRoute[outbound.route_id] ?? [] : [];
  const suggestedOutcome: CallOutcome | null =
    capacityFailure && capacityFailure.waitlisted.length === 0 ? "no_capacity" : null;
  const depositsDue = travellers.filter((t) => !t.depositWaived && !t.standingWaiver).length;
  const depositAmount = depositDefaults?.[currency] ?? null;
  const symbol = currency === "GBP" ? "£" : "€";
  const barDeposits =
    depositsDue === 0
      ? "no deposits"
      : depositAmount != null
        ? `${symbol}${(depositAmount * depositsDue).toFixed(2)} deposits`
        : `${depositsDue} deposit${depositsDue === 1 ? "" : "s"}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <PassengerLookupPanel
            selected={leadPassenger}
            onSelect={handleSelectLeadPassenger}
            defaultPickup={callerDefaults.pickup}
            defaultDropoff={callerDefaults.dropoff}
            defaultsError={defaultsError}
          />

          <Card step={2} title="Journey & day">
            <DepartureInfoPanel
              label={returnEnabled ? "Outbound" : ""}
              departures={initialDepartures}
              selectedId={outboundId}
              refreshKey={refreshKey}
              onSelect={(d) => {
                setOutboundId(d?.id ?? null);
                setCapacityFailure(null);
              }}
            />

            <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="text-sm font-medium text-slate-800">Book a return too</span>
              <input
                type="checkbox"
                role="switch"
                checked={returnEnabled}
                onChange={(e) => setReturnEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-blue-900 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400"
              />
            </label>

            {returnEnabled && (
              <div className="mt-3">
                <DepartureInfoPanel
                  label="Return"
                  departures={initialDepartures.filter((d) => d.id !== outboundId)}
                  selectedId={returnId}
                  refreshKey={refreshKey}
                  // Opens on the opposite way to the outbound, from the outbound day on.
                  defaultJourney={outbound ? journeyKey(outbound.route_id, oppositeDirection(outbound.direction)) : null}
                  fromDay={outbound ? ukDayKey(outbound.depart_at) : null}
                  onSelect={(d) => {
                    setReturnId(d?.id ?? null);
                    setCapacityFailure(null);
                  }}
                />
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <BookingFormPanel
            travellers={travellers}
            onChange={setTravellers}
            tariffs={outboundTariffs}
            direction={(outbound?.direction as DepartureDirection) ?? "outbound"}
            currency={currency}
            onCurrencyChange={setCurrency}
            areas={areas}
            addressSuggestions={addressSuggestions}
            depositDefaults={depositDefaults}
            tariffError={outbound ? tariffErrors[outbound.route_id] ?? null : null}
            hasDeparture={Boolean(outbound)}
          />
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {capacityFailure && (
          <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Can&apos;t book: {capacityFailure.message}</p>
            <p>Pick another departure, or put the caller on the waitlist and Office will offer a place if one frees up.</p>
            <div className="flex flex-wrap gap-2">
              {capacityFailure.legs.map((leg) =>
                capacityFailure.waitlisted.includes(leg.departureId) ? (
                  <span key={leg.departureId} className="rounded-lg bg-green-100 px-3 py-2 text-green-800">
                    On the waitlist ({leg.legName})
                  </span>
                ) : (
                  <button
                    key={leg.departureId}
                    type="button"
                    disabled={waitlistBusy || !leadPassenger}
                    onClick={() => handleWaitlist(leg.departureId)}
                    title={leg.label}
                    className="min-h-11 rounded-lg bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                  >
                    {waitlistBusy
                      ? "Adding..."
                      : capacityFailure.legs.length > 1
                        ? `Add to waitlist (${leg.legName})`
                        : "Add to waitlist"}
                  </button>
                )
              )}
            </div>
            {waitlistError && <p className="rounded-lg bg-red-50 p-2 text-red-700">Waitlist failed: {waitlistError}</p>}
          </div>
        )}

        {lastBooking && (
          <div className="space-y-1 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            <p className="text-base font-semibold">
              Reserved — reference <span className="font-mono">{lastBooking.reference}</span>
            </p>
            {lastBooking.legs.map((leg) => (
              <p key={leg.departureId}>
                <Link href={`/office/departures/${leg.departureId}`} className="font-medium underline">
                  {leg.label}
                </Link>
              </p>
            ))}
            {callLog.length > 0 && (
              <p className="text-xs text-green-800">Call logged as {outcomeLabel(callLog[0].outcome)}.</p>
            )}
            {lastBooking.warning && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{lastBooking.warning}</p>}
          </div>
        )}
      </div>

      {/* Reserve bar: stuck just above the phone tab bar, an ordinary block on md+. */}
      <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:static md:shadow-none">
        <p className="min-w-0 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">
            {travellers.length} passenger{travellers.length === 1 ? "" : "s"}
          </span>
          {returnEnabled ? " · return" : ""} · {barDeposits}
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="min-h-12 shrink-0 rounded-xl bg-blue-900 px-8 text-lg font-semibold text-white hover:bg-blue-950 disabled:opacity-50"
        >
          {submitting ? "Reserving..." : "Reserve"}
        </button>
      </div>

      <CallOutcomePanel
        key={callRound}
        callerName={leadPassenger?.full_name ?? null}
        logged={callLog}
        suggested={suggestedOutcome}
        busy={callBusy}
        error={callError}
        onLog={(outcome, notes) => void recordCall(outcome, notes, false)}
        onNotes={(notes) => void saveCallNotes(notes)}
        onNewCall={startNewCall}
      />
    </div>
  );
}
