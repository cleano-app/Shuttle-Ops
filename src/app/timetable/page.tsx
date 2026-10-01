import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dayDetails, monthGrid, type CalendarView, type DayEvent } from "@/lib/jewishCalendar";
import { formatUk, isoToUkLocal, ukLocalToIso } from "@/lib/time";
import { journeyEnds, placeStyle } from "@/lib/places";
import { Journey } from "@/components/Journey";
import { LogoMark } from "@/components/shell/Logo";
import { CurrencyConverter } from "@/components/office/CurrencyConverter";
import { getFxRates } from "@/lib/fx";
import type { PublicDepartureAvailability } from "@/types/database";

// Public timetable for customers (owner, 1 Oct 2026: "the calendar and
// converter also for customers"). Same Jewish / regular month as the office
// calendar, but only what a stranger may see: trip days, times and whether
// seats are free (list_public_departures, granted to anon). No bookings,
// names or crossing details. Open to everyone - see src/proxy.ts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Timetable — London ⇄ Antwerp",
  description: "Shuttle days between London and Antwerp, with the Jewish calendar.",
};

const EVENT_COLOR: Record<DayEvent["kind"], string> = {
  yomtov: "text-red-700",
  fast: "text-red-700",
  erev: "text-emerald-700",
  cholhamoed: "text-emerald-700",
  parsha: "text-amber-800",
  roshchodesh: "text-indigo-700",
  minor: "text-slate-600",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function seatsText(n: number) {
  if (n <= 0) return { text: "Full — join the waiting list", cls: "text-red-700" };
  if (n <= 3) return { text: `Only ${n} seat${n === 1 ? "" : "s"} left`, cls: "text-amber-700" };
  return { text: "Seats free", cls: "text-emerald-700" };
}

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; m?: string; d?: string }>;
}) {
  const sp = await searchParams;
  const view: CalendarView = sp.view === "regular" ? "regular" : "hebrew";
  const today = isoToUkLocal(new Date().toISOString()).slice(0, 10);
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const selected = isDate(sp.d) ? sp.d! : today;
  const anchor = isDate(sp.m) ? sp.m! : selected;
  const grid = monthGrid(view, anchor);

  const supabase = await createClient();
  const [{ data }, fx] = await Promise.all([
    supabase.rpc("list_public_departures", { p_limit: 300 }),
    getFxRates(),
  ]);
  const byDay = new Map<string, PublicDepartureAvailability[]>();
  for (const d of (data ?? []) as PublicDepartureAvailability[]) {
    const key = isoToUkLocal(d.depart_at).slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), d]);
  }

  const href = (p: { view?: CalendarView; m?: string; d?: string }) => {
    const q = new URLSearchParams();
    if ((p.view ?? view) === "regular") q.set("view", "regular");
    if (p.m) q.set("m", p.m);
    if (p.d) q.set("d", p.d);
    const s = q.toString();
    return `/timetable${s ? `?${s}` : ""}#day`;
  };
  const color = (d: PublicDepartureAvailability) => {
    const ends = journeyEnds(d.route_name, d.direction);
    return ends ? placeStyle(ends[0]).color : "#64748b";
  };

  const sel = dayDetails(selected);
  const selDeps = byDay.get(selected) ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 overflow-x-hidden bg-page px-4 pb-10 pt-5">
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <LogoMark />
          <span className="text-[17px] font-bold tracking-tight text-brand-dark">Timetable</span>
        </span>
        <Link href="/book" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-white">
          Book a seat
        </Link>
      </header>

      <div className="flex justify-end">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <Link
            href={href({ view: "hebrew", d: selected })}
            className={`rounded-md px-3 py-1.5 ${view === "hebrew" ? "bg-brand-dark text-white" : "text-slate-600"}`}
          >
            Jewish
          </Link>
          <Link
            href={href({ view: "regular", d: selected })}
            className={`rounded-md px-3 py-1.5 ${view === "regular" ? "bg-brand-dark text-white" : "text-slate-600"}`}
          >
            Regular
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between bg-brand-dark px-2 py-3 text-white">
          <Link href={href({ m: grid.prev, d: selected })} aria-label="Previous month" className="px-4 text-2xl">
            ‹
          </Link>
          <p className="text-lg font-semibold">{grid.title}</p>
          <Link href={href({ m: grid.next, d: selected })} aria-label="Next month" className="px-4 text-2xl">
            ›
          </Link>
        </div>
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] bg-slate-800 text-center text-xs text-slate-200">
          {WEEKDAYS.map((w) => (
            <div key={w} className={`py-2 ${w === "Sat" ? "font-semibold text-amber-300" : ""}`}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] border-s border-slate-200">
          {grid.weeks.flat().map((day) => {
            const list = byDay.get(day.date) ?? [];
            const isSel = day.date === selected;
            const bg =
              day.date === today
                ? "bg-amber-300/80"
                : !day.inMonth
                  ? "bg-slate-100/70"
                  : day.isShabbos || day.isYomTov
                    ? "bg-indigo-50"
                    : "bg-white";
            return (
              <Link
                key={day.date}
                href={href({ m: anchor, d: day.date })}
                aria-label={`${day.date} ${day.hebLabel}${list.length ? `, ${list.length} trips` : ""}`}
                className={`flex min-h-[78px] min-w-0 flex-col overflow-hidden border-b border-e border-slate-200 p-1 ${bg} ${
                  isSel ? "outline outline-2 -outline-offset-2 outline-brand-dark" : ""
                } ${day.inMonth ? "" : "opacity-60"}`}
              >
                <span className="text-[11px] font-semibold text-slate-500">
                  {view === "hebrew" ? day.gregDay : day.hebDay}
                </span>
                <span
                  dir={view === "hebrew" ? "rtl" : undefined}
                  className={`text-center font-semibold leading-none text-slate-900 ${view === "hebrew" ? "text-2xl" : "text-xl"}`}
                >
                  {view === "hebrew" ? day.hebDay : day.gregDay}
                </span>
                <span className="mt-1 flex flex-col gap-0.5">
                  {list.slice(0, 2).map((d) => (
                    <span
                      key={d.departure_id}
                      className="h-1.5 rounded-full"
                      style={{ background: color(d), opacity: d.seats_available > 0 ? 1 : 0.35 }}
                    />
                  ))}
                </span>
                {day.events[0] && (
                  <span className={`mt-auto line-clamp-2 text-center text-[10px] leading-tight ${EVENT_COLOR[day.events[0].kind]}`}>
                    {day.events[0].label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-5 rounded-full" style={{ background: placeStyle("London").color }} /> From London
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-5 rounded-full" style={{ background: placeStyle("Antwerp").color }} /> From Antwerp
          </span>
          <span>Faded = full</span>
        </div>
      </div>

      <section id="day" className="scroll-mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="bg-brand-dark p-4 text-white">
          <p className="text-lg font-semibold">{formatUk(ukLocalToIso(`${selected}T12:00`), { date: "full" })}</p>
          <p className="text-sm text-white/80">{sel.hebLabel}</p>
          {sel.events.length > 0 && (
            <p className="mt-1 text-sm font-semibold text-amber-300">
              {sel.events.map((e) => (e.kind === "parsha" ? `Parshas ${e.label}` : e.label)).join(" · ")}
            </p>
          )}
        </div>
        {selDeps.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No trips on this day.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {selDeps.map((d) => {
              const seats = seatsText(d.seats_available);
              return (
                <li
                  key={d.departure_id}
                  className="flex flex-wrap items-center justify-between gap-3 border-s-4 p-4"
                  style={{ borderInlineStartColor: color(d) }}
                >
                  <span className="space-y-1">
                    <span className="block text-lg font-semibold text-slate-900">{formatUk(d.depart_at, { time: "short" })}</span>
                    <Journey routeName={d.route_name} direction={d.direction} size="sm" />
                    <span className={`block text-sm font-medium ${seats.cls}`}>{seats.text}</span>
                  </span>
                  <Link
                    href={`/book?dep=${d.departure_id}`}
                    className="rounded-lg bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    {d.seats_available > 0 ? "Book" : "Join waiting list"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {fx && <CurrencyConverter perEur={fx.perEur} date={fx.date} />}

      <p className="text-center text-xs text-slate-500">
        Times are UK time. <Link href="/install" className="underline">Install the app</Link>
      </p>
    </main>
  );
}
