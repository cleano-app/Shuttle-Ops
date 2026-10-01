import { APP_TIME_ZONE } from "@/lib/time";

/** The fields the day picker needs from a departure (DepartureOption fits). */
export interface PickableDeparture {
  id: string;
  direction: string;
  depart_at: string;
  route_id: string;
  routeName: string;
  seatsLeft?: number | null;
}

export interface JourneyChoice {
  key: string;
  routeId: string;
  routeName: string;
  direction: string;
}

export interface DepartureDay<D extends PickableDeparture = PickableDeparture> {
  /** "2026-10-04" in UK time. */
  day: string;
  departures: D[];
  /** Total seats left across the day's departures; null if unknown. */
  seatsLeft: number | null;
  full: boolean;
}

export function journeyKey(routeId: string, direction: string): string {
  return `${routeId}|${direction}`;
}

export function oppositeDirection(direction: string): string {
  return direction === "return" ? "outbound" : direction === "outbound" ? "return" : direction;
}

/** The distinct journeys on sale, outbound before return within a route. */
export function journeysOf(departures: PickableDeparture[]): JourneyChoice[] {
  const seen = new Map<string, JourneyChoice>();
  for (const d of departures) {
    const key = journeyKey(d.route_id, d.direction);
    if (!seen.has(key)) seen.set(key, { key, routeId: d.route_id, routeName: d.routeName, direction: d.direction });
  }
  return [...seen.values()].sort(
    (a, b) =>
      a.routeName.localeCompare(b.routeName) ||
      a.routeId.localeCompare(b.routeId) ||
      (a.direction === "outbound" ? -1 : b.direction === "outbound" ? 1 : a.direction.localeCompare(b.direction))
  );
}

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** An instant's calendar day in UK time, "YYYY-MM-DD". */
export function ukDayKey(value: string | Date): string {
  return dayKeyFormat.format(new Date(value));
}

/** "YYYY-MM-DD" + n days (calendar arithmetic, no time zone involved). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "Sun 4 Oct" for a "YYYY-MM-DD" day key. */
export function dayChipLabel(day: string): { weekday: string; date: string } {
  const [y, m, d] = day.split("-").map(Number);
  // Noon UTC is the same calendar day in London all year round.
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = noon.toLocaleDateString("en-GB", { timeZone: APP_TIME_ZONE, weekday: "short" });
  const month = noon.toLocaleDateString("en-GB", { timeZone: APP_TIME_ZONE, month: "short" });
  return { weekday, date: `${d} ${month}` };
}

/** "14:00" in UK time. */
export function ukTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/**
 * Days with a departure on `journey`, from `fromDay` for `windowDays` days.
 * If nothing falls in that window the next `fallbackCount` days with a
 * departure are returned instead, so a sparse timetable still shows chips.
 */
export function departureDays<D extends PickableDeparture>(
  departures: D[],
  journey: string | null,
  fromDay: string,
  windowDays = 30,
  fallbackCount = 10
): DepartureDay<D>[] {
  const byDay = new Map<string, D[]>();
  for (const d of departures) {
    if (journey && journeyKey(d.route_id, d.direction) !== journey) continue;
    const day = ukDayKey(d.depart_at);
    if (day < fromDay) continue;
    const list = byDay.get(day) ?? [];
    list.push(d);
    byDay.set(day, list);
  }
  const all: DepartureDay<D>[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const sorted = [...list].sort((a, b) => a.depart_at.localeCompare(b.depart_at));
      const known = sorted.every((d) => d.seatsLeft != null);
      const seatsLeft = known ? sorted.reduce((sum, d) => sum + (d.seatsLeft ?? 0), 0) : null;
      return { day, departures: sorted, seatsLeft, full: sorted.every((d) => d.seatsLeft === 0) };
    });
  const until = addDays(fromDay, windowDays);
  const inWindow = all.filter((d) => d.day <= until);
  return inWindow.length > 0 ? inWindow : all.slice(0, fallbackCount);
}
