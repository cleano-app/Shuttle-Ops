"use client";

import { useEffect, useState } from "react";
import { getDepartureCapacitySummary } from "@/app/actions/departures";

export interface DepartureOption {
  id: string;
  direction: string;
  depart_at: string;
  status: string;
  seats_capacity: number;
  seats_released: number;
  route_id: string;
  routeName: string;
}

interface DepartureCapacitySummary {
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
}

interface DepartureInfoPanelProps {
  label: string;
  departures: DepartureOption[];
  selectedId: string | null;
  onSelect: (departure: DepartureOption | null) => void;
}

/**
 * Build spec §32 "Departure" panel — direction/date picker plus live
 * capacity (seats, hold, wheelchair, provisional share, composition,
 * status). Reads departure_capacity_summary (0020), a display-only view;
 * allocate_booking_capacity() remains the sole source of truth for whether
 * a booking is actually allowed.
 */
export function DepartureInfoPanel({ label, departures, selectedId, onSelect }: DepartureInfoPanelProps) {
  const [summary, setSummary] = useState<DepartureCapacitySummary | null>(null);
  const selected = departures.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) return;
    getDepartureCapacitySummary(selectedId).then((res) => {
      if (!cancelled && "summary" in res) setSummary((res.summary as DepartureCapacitySummary) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Rather than resetting `summary` to null synchronously inside the effect
  // above when selectedId clears, derive the displayed value at render
  // time — the stale summary is simply never shown once nothing is
  // selected, with no extra setState/render pass needed for the reset.
  const displaySummary = selectedId ? summary : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium text-slate-900">{label}</h2>
      <select
        value={selectedId ?? ""}
        onChange={(e) => {
          const found = departures.find((d) => d.id === e.target.value) ?? null;
          onSelect(found);
        }}
        className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Select a departure...</option>
        {departures.map((d) => (
          <option key={d.id} value={d.id}>
            {d.routeName} · {d.direction} ·{" "}
            {new Date(d.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} (
            {d.status})
          </option>
        ))}
      </select>

      {selected && (
        <div className="space-y-2 text-sm">
          <p className="text-slate-600">
            Seats released: <span className="font-medium">{selected.seats_released}</span> of{" "}
            {selected.seats_capacity}
          </p>
          {displaySummary && (
            <>
              <p className="text-slate-600">
                Used: <span className="font-medium">{displaySummary.seats_used}</span> seats ·{" "}
                {displaySummary.hold_used} hold units · {displaySummary.wheelchair_used} wheelchair
              </p>
              <p className="text-slate-600">
                {displaySummary.men}m · {displaySummary.women}w · {displaySummary.boys}b ·{" "}
                {displaySummary.girls}g · {displaySummary.infants} infants
              </p>
              <p className="text-slate-500">
                Unsecured (provisional/deposit pending): {displaySummary.unsecured_count}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
