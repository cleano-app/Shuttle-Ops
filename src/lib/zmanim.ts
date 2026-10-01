// Zmanim for both ends of the route (owner, 1 Oct 2026: "if possible add
// zemanim"), from Hebcal. Each city in its own local time, plus the same
// moments as instants so the day timeline (UK time) can draw shkia and
// candle lighting across both cities.
import { HebrewCalendar, Location, Zmanim } from "@hebcal/core";

export interface CityZmanim {
  city: "London" | "Antwerp";
  tz: string;
  rows: { label: string; time: string; at: Date | null }[];
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
    const rows = [
      { label: "Netz (sunrise)", at: at.netz },
      { label: "Sof zman Shema (MGA)", at: at.shmaMga },
      { label: "Sof zman Shema (Gra)", at: at.shma },
      { label: "Sof zman Tefillah", at: at.tfila },
      { label: "Chatzos", at: at.chatzos },
      { label: "Mincha gedola", at: at.minchaGedola },
      ...(candles ? [{ label: "Candle lighting", at: candles }] : []),
      { label: "Shkia (sunset)", at: at.shkia },
      { label: "Tzeis", at: at.tzeis },
      ...(havdalah ? [{ label: "Havdalah", at: havdalah }] : []),
    ].map((r) => ({ ...r, time: fmt(r.at) }));
    return { city, tz, rows, shkia: at.shkia, candles, havdalah };
  });
}
