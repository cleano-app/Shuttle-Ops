import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayDetails } from "@/lib/jewishCalendar";
import { formatUk, isoToUkLocal, ukLocalToIso } from "@/lib/time";
import { journeyEnds, placeStyle } from "@/lib/places";
import { Journey } from "@/components/Journey";
import { AddFab } from "@/components/shell/AddFab";
import { zmanimFor } from "@/lib/zmanim";
import { ZmanIcon } from "@/components/ZmanIcon";
import { TimelineZoom } from "@/components/office/TimelineZoom";

type DepartureRow = {
  id: string;
  direction: string;
  depart_at: string;
  arrive_estimate: string | null;
  status: string;
  seats_released: number;
  routes?: { name?: string } | null;
};
type BookingRow = {
  id: string;
  status: string;
  departure_id: string;
  passengers?: { full_name?: string } | null;
  booking_passengers?: { id: string; status: string }[];
};

// Whole day, 00:00-24:00. Heights scale with --hour (TimelineZoom).
const FIRST_HOUR = 0;
const LAST_HOUR = 23;
/** CSS length for `h` hours on the zoomable timeline. */
const hrs = (h: number) => `calc(var(--hour) * ${h.toFixed(4)})`;

function shift(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Minutes after midnight, UK time. */
function ukMinutes(iso: string) {
  const [h, m] = isoToUkLocal(iso).slice(11, 16).split(":").map(Number);
  return h * 60 + m;
}

/**
 * One day, Google Calendar style (owner, 1 Oct 2026): an hour timeline with
 * each departure as a block from leaving to arrival, in the colour of
 * where it leaves from, with its bookings listed inside. Reached by tapping
 * a day on the month calendar.
 */
export default async function CalendarDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const info = dayDetails(date);
  const zmanim = zmanimFor(date);
  const today = isoToUkLocal(new Date().toISOString()).slice(0, 10);

  const supabase = await createClient();
  const { data: deps } = await supabase
    .from("departures")
    .select("id, direction, depart_at, arrive_estimate, status, seats_released, routes(name)")
    .neq("status", "cancelled")
    .gte("depart_at", ukLocalToIso(`${date}T00:00`)!)
    .lte("depart_at", ukLocalToIso(`${date}T23:59`)!)
    .order("depart_at", { ascending: true });
  const departures = (deps ?? []) as unknown as DepartureRow[];
  const ids = departures.map((d) => d.id);

  const [{ data: bookings }, { data: summaries }, { data: crew }] = await Promise.all([
    ids.length
      ? supabase
          .from("bookings")
          .select("id, status, departure_id, passengers:lead_passenger_id(full_name), booking_passengers(id, status)")
          .in("departure_id", ids)
          .not("status", "in", "(cancelled,expired)")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("departure_capacity_summary").select("departure_id, seats_used").in("departure_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from("driver_assignments")
          .select("departure_id, profiles:driver_id(display_name)")
          .in("departure_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const seats = new Map((summaries ?? []).map((s) => [s.departure_id, s.seats_used ?? 0]));
  const bookingsOf = new Map<string, BookingRow[]>();
  for (const b of (bookings ?? []) as unknown as BookingRow[]) {
    bookingsOf.set(b.departure_id, [...(bookingsOf.get(b.departure_id) ?? []), b]);
  }
  const driverOf = new Map<string, string[]>();
  for (const c of (crew ?? []) as unknown as { departure_id: string; profiles?: { display_name?: string } }[]) {
    driverOf.set(c.departure_id, [...(driverOf.get(c.departure_id) ?? []), c.profiles?.display_name ?? "Driver"]);
  }

  // Lay out blocks; overlapping ones share the width side by side.
  const blocks = departures.map((d) => {
    const start = ukMinutes(d.depart_at);
    let end = d.arrive_estimate ? ukMinutes(d.arrive_estimate) : start + 7 * 60;
    if (end <= start) end = LAST_HOUR * 60 + 59; // arrives after midnight
    return { d, start, end: Math.min(end, (LAST_HOUR + 1) * 60) };
  });
  const lanes: number[] = [];
  const placed = blocks.map((b) => {
    let lane = lanes.findIndex((endAt) => endAt <= b.start);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = b.end;
    return { ...b, lane };
  });
  const laneCount = Math.max(1, lanes.length);
  const nowMin = date === today ? ukMinutes(new Date().toISOString()) : null;

  // Shkia / candle lighting for both cities as lines on the (UK time) timeline.
  const markers = zmanim.flatMap((z) =>
    [
      z.candles && { at: z.candles, label: `Candles ${z.city}`, color: "#d97706" },
      z.shkia && { at: z.shkia, label: `Shkia ${z.city}`, color: z.city === "London" ? "#1d4ed8" : "#dc2626" },
    ].filter(Boolean) as { at: Date; label: string; color: string }[]
  )
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    // Labels within 12 minutes of the previous one go on the other side so
    // they don't sit on top of each other.
    .map((m, i, all) => ({
      ...m,
      left: i > 0 && m.at.getTime() - all[i - 1].at.getTime() < 12 * 60_000 && !(i > 1 && all[i - 1].at.getTime() - all[i - 2].at.getTime() < 12 * 60_000),
    }));

  // Erev Shabbos / Yom Tov: anything still on the road at the earliest
  // candle lighting (either city) gets flagged.
  const candleTimes = zmanim.map((z) => z.candles).filter((c): c is Date => Boolean(c));
  const firstCandles = candleTimes.length ? new Date(Math.min(...candleTimes.map((c) => c.getTime()))) : null;
  const lateIds = new Set(
    firstCandles
      ? departures
          .filter((d) => {
            const arrive = d.arrive_estimate ? new Date(d.arrive_estimate) : new Date(new Date(d.depart_at).getTime() + 7 * 3600_000);
            return arrive > firstCandles;
          })
          .map((d) => d.id)
      : []
  );

  const heading = formatUk(ukLocalToIso(`${date}T12:00`), { date: "full" });

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/office/calendar?d=${date}`} className="text-sm text-slate-500 hover:underline">
          ← Month
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/office/calendar/day/${shift(date, -1)}`}
            aria-label="Previous day"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg"
          >
            ‹
          </Link>
          {date !== today && (
            <Link
              href={`/office/calendar/day/${today}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            >
              Today
            </Link>
          )}
          <Link
            href={`/office/calendar/day/${shift(date, 1)}`}
            aria-label="Next day"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="rounded-xl bg-brand-dark p-4 text-white">
        <p className="text-xl font-semibold">{heading}</p>
        <p className="text-sm text-white/80">{info.hebLabel}</p>
        {info.events.length > 0 && (
          <p className="mt-1 text-sm font-semibold text-amber-300">
            {info.events.map((e) => (e.kind === "parsha" ? `Parshas ${e.label}` : e.label)).join(" · ")}
          </p>
        )}
      </div>

      {lateIds.size > 0 && firstCandles && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800 ring-1 ring-red-200">
          {lateIds.size === 1 ? "A departure arrives" : `${lateIds.size} departures arrive`} after candle lighting
          ({formatUk(firstCandles.toISOString(), { time: "short" })} UK time). Check the schedule.
        </p>
      )}

      {(info.isShabbos || info.isYomTov) && departures.length > 0 && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">
          This day is {info.isYomTov ? "Yom Tov" : "Shabbos"} — check these departures.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {departures.length === 0 && (
          <p className="border-b border-slate-200 p-4 text-sm text-slate-500">No departures on this day.</p>
        )}
        <TimelineZoom>
        <div className="relative flex pt-2">
          <div className="w-12 shrink-0 border-e border-slate-200">
            {Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => (
              <div key={i} className="relative text-end text-[11px] text-slate-400" style={{ height: hrs(1) }}>
                {i > 0 && <span className="absolute -top-2 end-1.5">{String(FIRST_HOUR + i).padStart(2, "0")}:00</span>}
              </div>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: hrs(LAST_HOUR - FIRST_HOUR + 1) }}>
            {Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => (
              <div key={i} className="border-b border-slate-100" style={{ height: hrs(1) }} />
            ))}
            {nowMin !== null && nowMin >= FIRST_HOUR * 60 && nowMin <= (LAST_HOUR + 1) * 60 && (
              <div
                className="absolute inset-x-0 z-10 border-t-2 border-red-500"
                data-scroll-anchor
                style={{ top: hrs((nowMin - FIRST_HOUR * 60) / 60) }}
              >
                <span className="absolute -start-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
              </div>
            )}
            {markers.map((m) => {
              const min = ukMinutes(m.at.toISOString());
              if (min < FIRST_HOUR * 60 || min > (LAST_HOUR + 1) * 60) return null;
              return (
                <div
                  key={m.label}
                  className="pointer-events-none absolute inset-x-0 z-[5] border-t border-dashed"
                  style={{ top: hrs((min - FIRST_HOUR * 60) / 60), borderColor: m.color }}
                >
                  <span
                    className={`absolute -top-4 rounded bg-white/90 px-1 text-[10px] font-semibold ${m.left ? "start-1" : "end-1"}`}
                    style={{ color: m.color }}
                  >
                    {m.label} {formatUk(m.at.toISOString(), { time: "short" })}
                  </span>
                </div>
              );
            })}
            {placed.map(({ d, start, end, lane }) => {
              const ends = journeyEnds(d.routes?.name, d.direction);
              const color = ends ? placeStyle(ends[0]).color : "#64748b";
              const top = hrs((Math.max(start, FIRST_HOUR * 60) - FIRST_HOUR * 60) / 60);
              const height = `max(2.75rem, calc(${hrs((end - Math.max(start, FIRST_HOUR * 60)) / 60)} - 2px))`;
              const list = bookingsOf.get(d.id) ?? [];
              const drivers = driverOf.get(d.id);
              return (
                <Link
                  key={d.id}
                  href={`/office/departures/${d.id}`}
                  data-scroll-anchor={nowMin === null && d.id === placed[0]?.d.id ? "" : undefined}
                  className="absolute z-[6] overflow-hidden rounded-lg border-s-4 p-2 text-xs shadow-sm hover:brightness-95"
                  style={{
                    top,
                    height,
                    left: `calc(${(lane / laneCount) * 100}% + 4px)`,
                    width: `calc(${100 / laneCount}% - 8px)`,
                    background: `${color}14`,
                    borderInlineStartColor: color,
                  }}
                >
                  <p className="font-semibold text-slate-900">
                    {formatUk(d.depart_at, { time: "short" })}
                    {d.arrive_estimate && <> – {formatUk(d.arrive_estimate, { time: "short" })}</>}
                    <span className="ms-2 font-normal text-slate-600"> 
                      {seats.get(d.id) ?? 0}/{d.seats_released} seats
                    </span>
                  </p>
                  <Journey routeName={d.routes?.name} direction={d.direction} size="sm" />
                  {lateIds.has(d.id) && (
                    <p className="mt-0.5 font-semibold text-red-700">Arrives after candle lighting</p>
                  )}
                  {drivers && <p className="mt-0.5 text-slate-600">Driver: {drivers.join(", ")}</p>}
                  {list.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-slate-800">
                      {list.map((b) => {
                        const pax = (b.booking_passengers ?? []).filter(
                          (p) => !["cancelled", "expired"].includes(p.status)
                        ).length;
                        return (
                          <li key={b.id} className="truncate">
                            {b.passengers?.full_name ?? "Passenger"}
                            {pax > 1 ? ` ×${pax}` : ""}
                            {b.status !== "confirmed" && <span className="text-amber-700"> · {b.status.replace("_", " ")}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
        </TimelineZoom>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">Zmanim</h2>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 p-4 text-sm">
          <span />
          {zmanim.map((z) => (
            <span key={z.city} className="text-end text-xs font-semibold uppercase tracking-wide" style={{ color: placeStyle(z.city).color }}>
              {z.city}
            </span>
          ))}
          {zmanim[0].rows.map((row, i) => (
            <div key={row.label} className="contents">
              <span
                className={`flex items-center gap-2.5 ${row.label.startsWith("Candle") || row.label === "Havdalah" ? "font-semibold text-amber-700" : "text-slate-600"}`}
              >
                <ZmanIcon name={row.icon} />
                {row.label}
              </span>
              {zmanim.map((z) => (
                <span key={z.city} className="text-end font-medium tabular-nums text-slate-900">
                  {z.rows[i]?.time ?? "—"}
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          Each city in its own local time (Antwerp is an hour ahead). Candle lighting 18 minutes before shkia; tzeis and havdalah at 8.5°. On the timeline above, lines are shown in UK time.
        </p>
      </section>
      <AddFab href={`/office/departures/new?date=${date}`} label="New departure" />
    </div>
  );
}
