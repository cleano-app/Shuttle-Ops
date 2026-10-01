"use client";

import { compositionText } from "@/lib/categories";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getDepartureCapacitySummary } from "@/app/actions/departures";
import { formatUk } from "@/lib/time";
import { journeyLabel } from "@/lib/journey";

export interface DepartureOption {
  id: string;
  direction: string;
  depart_at: string;
  status: string;
  seats_capacity: number;
  seats_released: number;
  route_id: string;
  routeName: string;
  /** seats_released - seats_used at page load (refreshed after each booking). */
  seatsLeft?: number | null;
}

interface DepartureCapacitySummary {
  seats_capacity: number;
  seats_released: number;
  hold_capacity_units: number | null;
  wheelchair_capacity: number | null;
  crossing_passenger_limit: number | null;
  seats_used: number;
  crossing_headcount: number;
  hold_used: number;
  wheelchair_used: number;
  unsecured_count: number;
  men: number;
  women: number;
  boys: number;
  girls: number;
  infants: number;
  unspecified?: number;
  luggage_units_used?: number;
  parcel_units_used?: number;
  parcel_count?: number;
}

interface DepartureInfoPanelProps {
  label: string;
  departures: DepartureOption[];
  selectedId: string | null;
  onSelect: (departure: DepartureOption | null) => void;
  /** Bump to re-fetch the live capacity summary (e.g. after a booking). */
  refreshKey?: number;
}

export function departureOptionLabel(d: DepartureOption, withSeats = true): string {
  const when = formatUk(d.depart_at, { date: "medium", time: "short" });
  const seats =
    !withSeats || d.seatsLeft == null ? "" : d.seatsLeft === 0 ? " · FULL" : ` · ${d.seatsLeft} seat${d.seatsLeft === 1 ? "" : "s"} left`;
  return `${when} · ${journeyLabel(d.routeName, d.direction)}${seats}`;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded border px-2 py-1.5 ${warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${warn ? "text-amber-900" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

/**
 * Build spec §32 "Departure" panel — direction/date picker plus live
 * capacity (seats, hold, wheelchair, provisional share, composition,
 * status). Reads departure_capacity_summary, a display-only view;
 * allocate_booking_capacity() remains the sole source of truth for whether
 * a booking is actually allowed.
 */
export function DepartureInfoPanel({ label, departures, selectedId, onSelect, refreshKey = 0 }: DepartureInfoPanelProps) {
  const [summary, setSummary] = useState<DepartureCapacitySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const selected = departures.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) return;
    getDepartureCapacitySummary(selectedId).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        setSummaryError(res.error);
        setSummary(null);
      } else {
        setSummaryError(null);
        setSummary(("summary" in res ? (res.summary as DepartureCapacitySummary | null) : null) ?? null);
      }
      setLoadedFor(selectedId);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshKey]);

  // Never show a previous departure's numbers against a new selection.
  const displaySummary = selectedId && loadedFor === selectedId ? summary : null;
  const seatsLeft = displaySummary ? Math.max(0, displaySummary.seats_released - displaySummary.seats_used) : null;
  const selectedMissing = selectedId && !selected;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium text-slate-900">{label}</h2>
      <select
        value={selectedId ?? ""}
        onChange={(e) => {
          const found = departures.find((d) => d.id === e.target.value) ?? null;
          onSelect(found);
        }}
        aria-label={label}
        className="mb-3 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">
          {departures.length === 0 ? "No published departures coming up" : "Select a departure..."}
        </option>
        {departures.map((d) => (
          // Full departures stay selectable: Office may still waitlist the caller.
          <option key={d.id} value={d.id}>
            {departureOptionLabel(d)}
          </option>
        ))}
      </select>

      {selectedMissing && (
        <p className="mb-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
          This departure is no longer open for booking. Pick another.
        </p>
      )}

      {selected && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-slate-700">
              <span className="font-medium">{formatUk(selected.depart_at, { date: "full", time: "short" })}</span>
              <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium capitalize text-green-800">
                {selected.status}
              </span>
            </p>
            <Link href={`/office/departures/${selected.id}`} className="text-sm font-medium text-blue-900 underline">
              Open departure
            </Link>
          </div>

          {summaryError && (
            <p role="alert" className="rounded bg-red-50 p-2 text-red-700">
              Couldn&apos;t load live capacity: {summaryError}
            </p>
          )}

          {!displaySummary && !summaryError && <p className="text-slate-500">Loading capacity...</p>}

          {displaySummary && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="Seats left"
                  value={`${seatsLeft} of ${displaySummary.seats_released}`}
                  warn={seatsLeft !== null && seatsLeft <= 2}
                />
                <Stat label="Seats used" value={`${displaySummary.seats_used} (${displaySummary.seats_capacity} fitted)`} />
                <Stat
                  label="Hold units"
                  value={
                    displaySummary.hold_capacity_units != null
                      ? `${displaySummary.hold_used} / ${displaySummary.hold_capacity_units}`
                      : String(displaySummary.hold_used)
                  }
                  warn={
                    displaySummary.hold_capacity_units != null &&
                    displaySummary.hold_used >= displaySummary.hold_capacity_units
                  }
                />
                <Stat
                  label="Wheelchair"
                  value={
                    displaySummary.wheelchair_capacity != null
                      ? `${displaySummary.wheelchair_used} / ${displaySummary.wheelchair_capacity}`
                      : String(displaySummary.wheelchair_used)
                  }
                />
                <Stat
                  label="Crossing headcount"
                  value={
                    displaySummary.crossing_passenger_limit != null
                      ? `${displaySummary.crossing_headcount} / ${displaySummary.crossing_passenger_limit}`
                      : String(displaySummary.crossing_headcount)
                  }
                />
                <Stat label="Provisional (unsecured)" value={String(displaySummary.unsecured_count)} />
              </div>
              {displaySummary.hold_used > 0 && displaySummary.luggage_units_used !== undefined && (
                <p className="text-xs text-slate-500">
                  Hold: luggage {displaySummary.luggage_units_used} · parcels {displaySummary.parcel_units_used ?? 0} (
                  {displaySummary.parcel_count ?? 0} parcels)
                </p>
              )}
              <p className="text-slate-600">
                {compositionText(displaySummary)}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
