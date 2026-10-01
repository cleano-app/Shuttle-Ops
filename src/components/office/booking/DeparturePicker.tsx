"use client";

import { useEffect, useRef, useState } from "react";
import { Journey } from "@/components/Journey";
import {
  departureDays,
  dayChipLabel,
  journeyKey,
  journeysOf,
  ukDayKey,
  ukTime,
  type DepartureDay,
  type PickableDeparture,
} from "./departureDays";

interface DeparturePickerProps<D extends PickableDeparture> {
  label: string;
  departures: D[];
  selectedId: string | null;
  onSelect: (departure: D | null) => void;
  /** Journey shown first when nothing is selected (journeyKey(route, direction)). */
  defaultJourney?: string | null;
  /** Only offer days on or after this UK day ("YYYY-MM-DD"); default today. */
  fromDay?: string | null;
  /** The old one-long-list picker, kept behind "Show all". */
  renderAll: () => React.ReactNode;
}

function seatsText(seatsLeft: number | null | undefined, full: boolean): string {
  if (full) return "Full";
  if (seatsLeft == null) return "";
  return `${seatsLeft} left`;
}

/**
 * Phone-first departure picker: journey toggle → day chips (next ~30 days
 * with a departure that way, seats left under each) → time, only when the
 * day has more than one. Full days stay tappable so Office can waitlist.
 */
export function DeparturePicker<D extends PickableDeparture>({
  label,
  departures,
  selectedId,
  onSelect,
  defaultJourney = null,
  fromDay = null,
  renderAll,
}: DeparturePickerProps<D>) {
  const [chosenJourney, setChosenJourney] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const journeys = journeysOf(departures);
  const selected = departures.find((d) => d.id === selectedId) ?? null;
  const selectedJourney = selected ? journeyKey(selected.route_id, selected.direction) : null;
  const known = (k: string | null) => (k && journeys.some((j) => j.key === k) ? k : null);
  const journey =
    known(chosenJourney) ?? selectedJourney ?? known(defaultJourney) ?? journeys[0]?.key ?? null;

  const today = ukDayKey(new Date());
  const start = fromDay && fromDay > today ? fromDay : today;
  const days: DepartureDay<D>[] = departureDays(departures, journey, start);
  const selectedDay = selected && selectedJourney === journey ? ukDayKey(selected.depart_at) : null;
  // A selection outside the 30-day window (e.g. from "Show all") still gets its chip.
  if (selectedDay && !days.some((d) => d.day === selectedDay)) {
    const extra = departureDays(departures, journey, selectedDay, 0).find((d) => d.day === selectedDay);
    if (extra) {
      days.push(extra);
      days.sort((a, b) => a.day.localeCompare(b.day));
    }
  }
  const dayDepartures = days.find((d) => d.day === selectedDay)?.departures ?? [];

  // Keep the chosen day chip in view in the scrolling strip.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !selectedDay) return;
    const chip = strip.querySelector<HTMLElement>(`[data-day="${selectedDay}"]`);
    if (!chip) return;
    strip.scrollTo({
      left: chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2,
      behavior: "smooth",
    });
  }, [selectedDay, journey]);

  function pickJourney(key: string) {
    setChosenJourney(key);
    if (selected && journeyKey(selected.route_id, selected.direction) !== key) onSelect(null);
  }

  function pickDay(day: DepartureDay<D>) {
    // Already on this day: keep the chosen time. Otherwise take the first
    // departure that day; the time row lets Office change it.
    if (selected && ukDayKey(selected.depart_at) === day.day && selectedJourney === journey) return;
    onSelect(day.departures.find((d) => d.seatsLeft !== 0) ?? day.departures[0]);
  }

  if (departures.length === 0) {
    return <p className="text-sm text-slate-500">No published departures coming up.</p>;
  }

  return (
    <div className="space-y-3">
      {journeys.length > 1 && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${label}: direction`}>
          {journeys.map((j) => {
            const on = j.key === journey;
            return (
              <button
                key={j.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickJourney(j.key)}
                className={`flex min-h-12 items-center justify-center rounded-lg border-2 px-2 py-2 ${
                  on ? "border-blue-900 bg-blue-50 shadow-sm" : "border-slate-200 bg-white"
                }`}
              >
                <Journey routeName={j.routeName} direction={j.direction} size="sm" className="justify-center" />
              </button>
            );
          })}
        </div>
      )}
      {journeys.length === 1 && (
        <Journey routeName={journeys[0].routeName} direction={journeys[0].direction} size="sm" />
      )}

      {days.length === 0 ? (
        <p className="text-sm text-slate-500">
          No departures this way{fromDay ? " on or after the outbound day" : ""}.
        </p>
      ) : (
        <div
          ref={stripRef}
          className="relative -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin]"
          aria-label={`${label}: day`}
        >
          {days.map((d) => {
            const { weekday, date } = dayChipLabel(d.day);
            const on = d.day === selectedDay;
            return (
              <button
                key={d.day}
                type="button"
                data-day={d.day}
                aria-pressed={on}
                onClick={() => pickDay(d)}
                className={`flex min-h-16 w-[4.75rem] shrink-0 snap-start flex-col items-center justify-center rounded-lg border-2 px-1 py-1.5 text-center leading-tight ${
                  on
                    ? "border-blue-900 bg-blue-900 text-white"
                    : d.full
                      ? "border-slate-200 bg-slate-100 text-slate-400"
                      : "border-slate-200 bg-white text-slate-900"
                }`}
              >
                <span className="text-xs font-medium">{weekday}</span>
                <span className="text-sm font-semibold whitespace-nowrap">{date}</span>
                <span
                  className={`mt-0.5 text-[11px] ${
                    on ? "text-blue-100" : d.full ? "font-medium text-slate-500" : "text-green-700"
                  }`}
                >
                  {seatsText(d.seatsLeft, d.full)}
                  {d.departures.length > 1 ? ` · ${d.departures.length}×` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {dayDepartures.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${label}: time`}>
          {dayDepartures.map((d) => {
            const on = d.id === selectedId;
            const full = d.seatsLeft === 0;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onSelect(d)}
                className={`min-h-11 rounded-lg border-2 px-3 py-1 text-sm ${
                  on
                    ? "border-blue-900 bg-blue-900 text-white"
                    : full
                      ? "border-slate-200 bg-slate-100 text-slate-500"
                      : "border-slate-200 bg-white text-slate-900"
                }`}
              >
                <span className="font-semibold tabular-nums">{ukTime(d.depart_at)}</span>
                <span className="ml-1.5 text-xs">{seatsText(d.seatsLeft, full)}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="text-xs font-medium text-blue-900 underline"
      >
        {showAll ? "Hide full list" : "Show all departures"}
      </button>
      {showAll && renderAll()}
    </div>
  );
}
