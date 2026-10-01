// Zmanim for both ends of the route (owner, 1 Oct 2026: "if possible add
// zemanim"), from Hebcal. Each city in its own local time, plus the same
// moments as instants so the day timeline (UK time) can draw shkia and
// candle lighting across both cities.
import { HebrewCalendar, Location, Zmanim } from "@hebcal/core";

export type ZmanIcon = "sunrise" | "shema" | "tefillah" | "chatzos" | "mincha" | "candles" | "sunset" | "tzeis" | "havdalah";

export interface CityZmanim {
  city: "London" | "Antwerp";
  tz: string;
  rows: { label: string; icon: ZmanIcon; time: string; at: Date | null }[];
  shkia: Date | null;
  candles: Date | null;
  havdalah: Date | null;
}

const CITIES = [
  { city: "London" as const, loc: new Location(51.5074, -0.1278, false, "Europe/London", "London", "GB") },
  { city: "Antwerp" as const, loc: new Location(51.2194, 4.4025, false, "Europe/Brussels", "Antwerp", "BE") },
];

function valid(d: Date | null | undefined): Date | null {
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** `day` is "YYYY-MM-DD". */
export function zmanimFor(day: string): CityZmanim[] {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return CITIES.map(({ city, loc }) => {
    const z = new Zmanim(loc, date, false);
    const tz = loc.getTzid();
    const fmt = (t: Date | null) =>
      t ? t.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }) : "—";
    const events = HebrewCalendar.calendar({
      start: date,
      end: date,
      candlelighting: true,
      location: loc,
      candleLightingMins: 18,
      havdalahDeg: 8.5,
      noHolidays: true,
      sedrot: false,
    });
    const timed = (prefix: string) =>
      valid((events.find((e) => e.render("en").startsWith(prefix)) as { eventTime?: Date } | undefined)?.eventTime);
    const candles = timed("Candle lighting");
    const havdalah = timed("Havdalah");
    const at = {
      netz: valid(z.sunrise()),
      shmaMga: valid(z.sofZmanShmaMGA()),
      shma: valid(z.sofZmanShma()),
      tfila: valid(z.sofZmanTfilla()),
      chatzos: valid(z.chatzot()),
      minchaGedola: valid(z.minchaGedola()),
      shkia: valid(z.sunset()),
      tzeis: valid(z.tzeit(8.5)),
    };
    const rows: { label: string; icon: ZmanIcon; at: Date | null }[] = [
      { label: "Netz (sunrise)", icon: "sunrise", at: at.netz },
      { label: "Sof zman Shema (MGA)", icon: "shema", at: at.shmaMga },
      { label: "Sof zman Shema (Gra)", icon: "shema", at: at.shma },
      { label: "Sof zman Tefillah", icon: "tefillah", at: at.tfila },
      { label: "Chatzos", icon: "chatzos", at: at.chatzos },
      { label: "Mincha gedola", icon: "mincha", at: at.minchaGedola },
      ...(candles ? [{ label: "Candle lighting", icon: "candles" as const, at: candles }] : []),
      { label: "Shkia (sunset)", icon: "sunset", at: at.shkia },
      { label: "Tzeis", icon: "tzeis", at: at.tzeis },
      ...(havdalah ? [{ label: "Havdalah", icon: "havdalah" as const, at: havdalah }] : []),
    ];
    const timedRows = rows.map((r) => ({ ...r, time: fmt(r.at) }));
    return { city, tz, rows: timedRows, shkia: at.shkia, candles, havdalah };
  });
}
