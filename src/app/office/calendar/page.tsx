import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dayDetails, monthGrid, type CalendarDay, type CalendarView, type DayEvent } from "@/lib/jewishCalendar";
import { formatUk, isoToUkLocal, ukLocalToIso } from "@/lib/time";
import { journeyEnds, placeStyle } from "@/lib/places";
import { Journey } from "@/components/Journey";
import { AddFab } from "@/components/shell/AddFab";

type DepartureRow = {
  id: string;
  direction: string;
  depart_at: string;
  status: string;
  seats_released: number;
  routes?: { name?: string } | null;
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

function ukDay(iso: string) {
  return isoToUkLocal(iso).slice(0, 10);
}

/**
 * Office calendar (owner, 1 Oct 2026): Jewish or regular month with the
 * bookings on it. Hebrew view puts the Hebrew day big and the regular date
 * in the corner (like the owner's sample); regular view the other way
 * round. Each departure is a coloured bar (colour of where it leaves from)
 * with seats booked. Tap a day for its details and departures.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; m?: string; d?: string }>;
}) {
  const sp = await searchParams;
  const view: CalendarView = sp.view === "regular" ? "regular" : "hebrew";
  const today = ukDay(new Date().toISOString());
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const selected = isDate(sp.d) ? sp.d! : today;
  const anchor = isDate(sp.m) ? sp.m! : selected;
  const grid = monthGrid(view, anchor);

  const supabase = await createClient();
  const [{ data: deps }, { data: summaries }] = await Promise.all([
    supabase
      .from("departures")
      .select("id, direction, depart_at, status, seats_released, routes(name)")
      .neq("status", "cancelled")
      .gte("depart_at", ukLocalToIso(`${grid.first}T00:00`)!)
      .lte("depart_at", ukLocalToIso(`${grid.last}T23:59`)!)
      .order("depart_at", { ascending: true }),
    supabase.from("departure_capacity_summary").select("departure_id, seats_used"),
  ]);
  const seatsUsed = new Map((summaries ?? []).map((s) => [s.departure_id, s.seats_used ?? 0]));
  const byDay = new Map<string, DepartureRow[]>();
  for (const d of (deps ?? []) as unknown as DepartureRow[]) {
    const key = ukDay(d.depart_at);
    byDay.set(key, [...(byDay.get(key) ?? []), d]);
  }

  const href = (p: { view?: CalendarView; m?: string; d?: string }) => {
    const q = new URLSearchParams();
    const v = p.view ?? view;
    if (v === "regular") q.set("view", "regular");
    if (p.m) q.set("m", p.m);
    if (p.d) q.set("d", p.d);
    const s = q.toString();
    return `/office/calendar${s ? `?${s}` : ""}`;
  };

  const sel = dayDetails(selected);
  const selDeps = byDay.get(selected) ?? [];
  const restDay = sel.isShabbos || sel.isYomTov;

  function startColor(d: DepartureRow) {
    const ends = journeyEnds(d.routes?.name, d.direction);
    return ends ? placeStyle(ends[0]).color : "#64748b";
  }

  function Cell({ day }: { day: CalendarDay }) {
    const list = byDay.get(day.date) ?? [];
    const isSel = day.date === selected;
    const isToday = day.date === today;
    const shaded = day.isShabbos || day.isYomTov;
    const bg = isToday
      ? "bg-amber-300/80"
      : !day.inMonth
        ? "bg-slate-100/70"
        : shaded
          ? "bg-indigo-50"
          : "bg-white";
    const big = view === "hebrew" ? day.hebDay : String(day.gregDay);
    const small = view === "hebrew" ? String(day.gregDay) : day.hebDay;
    return (
      <Link
        href={href({ m: anchor, d: day.date })}
        scroll={false}
        aria-label={`${day.date} ${day.hebLabel}${list.length ? `, ${list.length} departures` : ""}`}
        className={`relative flex min-h-[86px] flex-col overflow-hidden border-b border-e border-slate-200 p-1 md:min-h-[104px] md:p-1.5 ${bg} ${
          isSel ? "outline outline-2 -outline-offset-2 outline-brand-dark" : ""
        } ${day.inMonth ? "" : "opacity-60"}`}
      >
        <span className={`text-[11px] font-semibold md:text-xs ${day.inMonth ? "text-slate-500" : "text-slate-400"}`}>
          {small}
        </span>
        <span
          dir={view === "hebrew" ? "rtl" : undefined}
          className={`text-center font-semibold leading-none ${view === "hebrew" ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"} ${
            day.inMonth ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {big}
        </span>
        <span className="mt-1 flex flex-col gap-0.5">
          {list.slice(0, 3).map((d) => (
            <span key={d.id} className="flex items-center gap-1">
              <span className="h-1.5 flex-1 rounded-full" style={{ background: startColor(d) }} />
              <span className="text-[10px] font-semibold text-slate-700">{seatsUsed.get(d.id) ?? 0}</span>
            </span>
          ))}
          {list.length > 3 && <span className="text-[10px] text-slate-500">+{list.length - 3}</span>}
        </span>
        {day.events[0] && (
          <span
            className={`mt-auto line-clamp-2 text-center text-[10px] leading-tight md:text-xs ${EVENT_COLOR[day.events[0].kind]}`}
          >
            {day.events[0].label}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Calendar</h1>
        <div className="flex items-center gap-2">
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
          {selected !== today && (
            <Link href={href({})} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
              Today
            </Link>
          )}
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
        <div className="grid grid-cols-7 bg-slate-800 text-center text-xs text-slate-200 md:text-sm">
          {WEEKDAYS.map((w) => (
            <div key={w} className={`py-2 ${w === "Sat" ? "font-semibold text-amber-300" : ""}`}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-s border-slate-200">
          {grid.weeks.flat().map((day) => (
            <Cell key={day.date} day={day} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-5 rounded-full" style={{ background: placeStyle("London").color }} /> Leaves London
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-5 rounded-full" style={{ background: placeStyle("Antwerp").color }} /> Leaves Antwerp
          </span>
          <span>Number = seats booked</span>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-2 bg-brand-dark p-4 text-white">
          <div>
            <p className="text-lg font-semibold">{sel.hebLabel}</p>
            <p className="text-sm text-white/80">{formatUk(ukLocalToIso(`${selected}T12:00`), { date: "full" })}</p>
          </div>
          {sel.events.length > 0 && (
            <div className="text-end text-sm font-semibold text-amber-300">
              {sel.events.map((e) => (
                <p key={e.label}>{e.kind === "parsha" ? `Parshas ${e.label}` : e.label}</p>
              ))}
            </div>
          )}
        </div>

        {restDay && selDeps.length > 0 && (
          <p className="border-b border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
            This day is {sel.isYomTov ? "Yom Tov" : "Shabbos"} — check these departures.
          </p>
        )}

        {selDeps.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No departures on this day.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {selDeps.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/office/departures/${d.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-s-4 p-4 hover:bg-slate-50"
                  style={{ borderInlineStartColor: startColor(d) }}
                >
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-lg font-semibold text-slate-900">{formatUk(d.depart_at, { time: "short" })}</span>
                    <Journey routeName={d.routes?.name} direction={d.direction} size="sm" />
                  </span>
                  <span className="text-sm text-slate-600">
                    {seatsUsed.get(d.id) ?? 0} booked / {d.seats_released} · {d.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3 border-t border-slate-200 p-4 text-sm">
          <Link href={`/office/departures/new?date=${selected}`} className="font-medium text-brand-dark underline">
            + New departure on this day
          </Link>
        </div>
      </section>

      <AddFab href={`/office/departures/new?date=${selected}`} label="New departure" />
    </div>
  );
}
