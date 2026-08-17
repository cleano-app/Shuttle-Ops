"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOnlineBooking, type OnlinePassengerLegInput } from "@/app/actions/portalBookings";
import { defaultOccupiesSeat } from "@/components/office/types";
import { PortalAddressAutocomplete, type PortalAddressOption } from "./PortalAddressAutocomplete";
import { getTranslator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";
import type { Currency, PassengerCategory, PublicDepartureAvailability } from "@/types/database";

const CATEGORIES: PassengerCategory[] = ["man", "woman", "boy", "girl", "infant"];

interface LegState {
  departureId: string;
  category: PassengerCategory;
  pickupAddressId: string | null;
  pickupLabel: string;
  dropoffAddressId: string | null;
  dropoffLabel: string;
  wheelchairSpace: boolean;
  luggage: { large: number; small: number; hand: number; oversize: number };
  currency: Currency;
}

function emptyLeg(departureId: string): LegState {
  return {
    departureId,
    category: "man",
    pickupAddressId: null,
    pickupLabel: "",
    dropoffAddressId: null,
    dropoffLabel: "",
    wheelchairSpace: false,
    luggage: { large: 0, small: 0, hand: 1, oversize: 0 },
    currency: "GBP",
  };
}

function legFieldset(
  leg: LegState,
  setLeg: (leg: LegState) => void,
  departures: PublicDepartureAvailability[],
  t: (key: Parameters<ReturnType<typeof getTranslator>>[0]) => string,
  titleKey: "book_outbound" | "book_return"
) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
      <legend className="px-1 font-medium text-slate-900">{t(titleKey)}</legend>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("book_departure")}</label>
        <select
          value={leg.departureId}
          onChange={(e) => setLeg({ ...leg, departureId: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {departures.map((d) => (
            <option key={d.departure_id} value={d.departure_id}>
              {d.route_name} · {d.direction} ·{" "}
              {new Date(d.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} (
              {d.seats_available} {t("book_seats_available")})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("book_category")}</label>
        <select
          value={leg.category}
          onChange={(e) => setLeg({ ...leg, category: e.target.value as PassengerCategory })}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <PortalAddressAutocomplete
        label={t("book_pickup")}
        value={leg.pickupLabel}
        onSelect={(a: PortalAddressOption) => setLeg({ ...leg, pickupAddressId: a.id, pickupLabel: a.line1 })}
      />
      <PortalAddressAutocomplete
        label={t("book_dropoff")}
        value={leg.dropoffLabel}
        onSelect={(a: PortalAddressOption) => setLeg({ ...leg, dropoffAddressId: a.id, dropoffLabel: a.line1 })}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t("book_luggage_large")}</label>
          <input
            type="number"
            min={0}
            value={leg.luggage.large}
            onChange={(e) => setLeg({ ...leg, luggage: { ...leg.luggage, large: Number(e.target.value) } })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t("book_luggage_small")}</label>
          <input
            type="number"
            min={0}
            value={leg.luggage.small}
            onChange={(e) => setLeg({ ...leg, luggage: { ...leg.luggage, small: Number(e.target.value) } })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t("book_luggage_hand")}</label>
          <input
            type="number"
            min={0}
            value={leg.luggage.hand}
            onChange={(e) => setLeg({ ...leg, luggage: { ...leg.luggage, hand: Number(e.target.value) } })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t("book_luggage_oversize")}</label>
          <input
            type="number"
            min={0}
            value={leg.luggage.oversize}
            onChange={(e) => setLeg({ ...leg, luggage: { ...leg.luggage, oversize: Number(e.target.value) } })}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={leg.wheelchairSpace}
          onChange={(e) => setLeg({ ...leg, wheelchairSpace: e.target.checked })}
        />
        {t("book_wheelchair_needed")}
      </label>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Currency</label>
        <select
          value={leg.currency}
          onChange={(e) => setLeg({ ...leg, currency: e.target.value as Currency })}
          className="w-32 rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
        </select>
      </div>
    </fieldset>
  );
}

export function BookTripForm({
  locale,
  departures,
  initialDepartureId,
}: {
  locale: Locale;
  departures: PublicDepartureAvailability[];
  initialDepartureId?: string;
}) {
  const router = useRouter();
  const t = getTranslator(locale);
  const [outbound, setOutbound] = useState<LegState>(emptyLeg(initialDepartureId ?? ""));
  const [includeReturn, setIncludeReturn] = useState(false);
  const [returnLeg, setReturnLeg] = useState<LegState>(emptyLeg(""));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toInput(leg: LegState): OnlinePassengerLegInput | null {
    if (!leg.departureId || !leg.pickupAddressId || !leg.dropoffAddressId) return null;
    return {
      departureId: leg.departureId,
      category: leg.category,
      occupiesSeat: defaultOccupiesSeat(leg.category),
      pickupAddressId: leg.pickupAddressId,
      dropoffAddressId: leg.dropoffAddressId,
      luggage: leg.luggage,
      wheelchairSpace: leg.wheelchairSpace,
      currency: leg.currency,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const outboundInput = toInput(outbound);
    if (!outboundInput) {
      setError("Please choose a departure and both addresses.");
      return;
    }
    const returnInput = includeReturn ? toInput(returnLeg) : null;
    if (includeReturn && !returnInput) {
      setError("Please complete the return leg, or turn it off.");
      return;
    }

    setPending(true);
    const result = await createOnlineBooking({ outbound: outboundInput, return: returnInput, notes });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReference(result.reference ?? null);
    router.refresh();
  }

  if (reference) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="font-medium text-green-800">Reserved — reference {reference}</p>
        <p className="mt-1 text-sm text-green-700">{t("book_deposit_notice")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {legFieldset(outbound, setOutbound, departures, t, "book_outbound")}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={includeReturn} onChange={(e) => setIncludeReturn(e.target.checked)} />
        {t("book_return")}
      </label>
      {includeReturn && legFieldset(returnLeg, setReturnLeg, departures, t, "book_return")}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("book_notes")}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">{t("book_deposit_notice")}</p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-brand-dark py-2.5 font-medium text-white disabled:opacity-50"
      >
        {t("book_submit")}
      </button>
    </form>
  );
}
