// Office and drivers work in UK time. Servers (Vercel) run in UTC, so
// anything that turns a typed time into an instant, or an instant into
// text, has to name the zone — otherwise a 07:00 departure entered in
// British Summer Time is stored as 08:00 and shown back as 06:00.

export const APP_TIME_ZONE = "Europe/London";

/** Offset (ms) of `zone` from UTC at the given instant. */
function zoneOffsetMs(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * A `<input type="datetime-local">` value ("2026-10-08T07:00") read as UK
 * wall-clock time, returned as an ISO instant. Empty input gives null.
 */
export function ukLocalToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes settle the offset either side of a clock change.
  let instant = wall - zoneOffsetMs(new Date(wall), APP_TIME_ZONE);
  instant = wall - zoneOffsetMs(new Date(instant), APP_TIME_ZONE);
  return new Date(instant).toISOString();
}

/** The reverse: an instant as a datetime-local value in UK time. */
export function isoToUkLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() + zoneOffsetMs(d, APP_TIME_ZONE));
  return local.toISOString().slice(0, 16);
}

type Style = "full" | "long" | "medium" | "short";

/** Format an instant in UK time. */
export function formatUk(
  value: string | Date | null | undefined,
  opts: { date?: Style; time?: Style } = { date: "medium", time: "short" }
): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    timeZone: APP_TIME_ZONE,
    dateStyle: opts.date,
    timeStyle: opts.time,
  });
}

/** ISO instant `hours` from now (negative for the past). */
export function isoHoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}
