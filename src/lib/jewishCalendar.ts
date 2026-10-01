// Jewish / regular calendar data for the Office calendar (owner, 1 Oct
// 2026: "need a Jewish/regular calendar with bookings", sample: a Hebrew
// month grid with the regular date in the corner, holidays, Shabbos with
// the parsha, Yom Tov shaded). Holidays and parshiyos come from Hebcal
// (diaspora schedule, Ashkenazi spellings: "Succos", "Shmini Atzeres").
// Dates are plain "YYYY-MM-DD" UK calendar days throughout.
import { HDate, HebrewCalendar, flags, gematriya, type Event } from "@hebcal/core";

export type DayEventKind = "yomtov" | "fast" | "erev" | "cholhamoed" | "parsha" | "roshchodesh" | "minor";

export interface DayEvent {
  label: string;
  kind: DayEventKind;
}

export interface CalendarDay {
  /** "2026-10-01" */
  date: string;
  gregDay: number;
  /** Hebrew day of month in letters, e.g. "כ", "טו" (no geresh). */
  hebDay: string;
  hebMonth: string;
  hebYear: number;
  /** "20 Tishrei 5787" */
  hebLabel: string;
  isShabbos: boolean;
  isYomTov: boolean;
  events: DayEvent[];
  /** Inside the month being shown (false = spill-over from the next/previous month). */
  inMonth: boolean;
}

export type CalendarView = "hebrew" | "regular";

function toDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
function toDay(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(day: string, n: number) {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** "כ׳" -> "כ", "ט״ו" -> "טו": the big letters in each cell. */
function hebLetters(n: number) {
  return gematriya(n).replace(/[׳״'"]/g, "");
}

/** Short, sample-style labels: "Sukkos VI (CH''M)" -> "Chol Hamoed". */
export function shortLabel(e: Event): string {
  const text = e.render("ashkenazi").replace(/[’‘]/g, "'");
  const f = e.getFlags();
  if (f & flags.PARSHA_HASHAVUA) return text.replace(/^Parshas\s+/, "");
  if (f & flags.CHOL_HAMOED) {
    const paren = text.match(/\(([^)]+)\)/)?.[1] ?? "";
    return /CH''M/.test(paren) || !paren ? "Chol Hamoed" : paren.replace("Hoshana Raba", "Hoshana Rabbah");
  }
  const paren = text.match(/\(([^)]+)\)/)?.[1];
  if (paren && !/CH''M/.test(paren)) return paren.replace("Hoshana Raba", "Hoshana Rabbah");
  return text
    .replace(/\s+\d{4}$/, "")
    .replace(/\s+(?:I|II|III|IV|V|VI|VII|VIII)$/, "")
    .replace("Tzom Gedaliah", "Fast of Gedalyah");
}

function kindOf(e: Event): DayEventKind {
  const f = e.getFlags();
  if (f & flags.PARSHA_HASHAVUA) return "parsha";
  if (f & flags.CHOL_HAMOED) return "cholhamoed";
  if (f & (flags.MAJOR_FAST | flags.MINOR_FAST)) return "fast";
  if (f & flags.EREV) return "erev";
  if (f & flags.CHAG) return "yomtov";
  if (f & flags.ROSH_CHODESH) return "roshchodesh";
  return "minor";
}

function eventsBetween(start: string, end: string): Map<string, DayEvent[]> {
  const evs = HebrewCalendar.calendar({
    start: toDate(start),
    end: toDate(end),
    il: false,
    sedrot: true,
    locale: "ashkenazi",
  });
  const out = new Map<string, DayEvent[]>();
  for (const e of evs) {
    const f = e.getFlags();
    // Skip noise the sample doesn't show.
    if (f & (flags.SPECIAL_SHABBAT | flags.SHABBAT_MEVARCHIM | flags.MOLAD | flags.DAF_YOMI | flags.OMER_COUNT)) continue;
    if (f & flags.MODERN_HOLIDAY) continue;
    const day = toDay(e.getDate().greg());
    const list = out.get(day) ?? [];
    const label = shortLabel(e);
    if (!list.some((x) => x.label === label)) list.push({ label, kind: kindOf(e) });
    out.set(day, list);
  }
  return out;
}

function dayInfo(day: string, events: Map<string, DayEvent[]>, inMonth: boolean): CalendarDay {
  const g = toDate(day);
  const h = new HDate(g);
  const evs = events.get(day) ?? [];
  return {
    date: day,
    gregDay: g.getDate(),
    hebDay: hebLetters(h.getDate()),
    hebMonth: h.getMonthName(),
    hebYear: h.getFullYear(),
    hebLabel: `${h.getDate()} ${h.getMonthName()} ${h.getFullYear()}`,
    isShabbos: g.getDay() === 6,
    isYomTov: evs.some((e) => e.kind === "yomtov"),
    events: evs,
    inMonth,
  };
}

export interface MonthGrid {
  title: string;
  /** Any day inside the previous / next month, to navigate with. */
  prev: string;
  next: string;
  weeks: CalendarDay[][];
  first: string;
  last: string;
}

/** Sunday-first weeks covering the Hebrew or regular month containing `day`. */
export function monthGrid(view: CalendarView, day: string): MonthGrid {
  let first: string;
  let last: string;
  let title: string;
  if (view === "hebrew") {
    const h = new HDate(toDate(day));
    const start = new HDate(1, h.getMonth(), h.getFullYear());
    const end = new HDate(start.daysInMonth(), h.getMonth(), h.getFullYear());
    first = toDay(start.greg());
    last = toDay(end.greg());
    title = `${start.getMonthName()} ${start.getFullYear()}`;
  } else {
    const g = toDate(day);
    const start = new Date(g.getFullYear(), g.getMonth(), 1, 12);
    const end = new Date(g.getFullYear(), g.getMonth() + 1, 0, 12);
    first = toDay(start);
    last = toDay(end);
    title = start.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  const gridStart = addDays(first, -toDate(first).getDay());
  const gridEnd = addDays(last, 6 - toDate(last).getDay());
  const events = eventsBetween(gridStart, gridEnd);
  const weeks: CalendarDay[][] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const cur = addDays(d, i);
      week.push(dayInfo(cur, events, cur >= first && cur <= last));
    }
    weeks.push(week);
  }
  return { title, prev: addDays(first, -1), next: addDays(last, 1), weeks, first: gridStart, last: gridEnd };
}

/** One day's details (for the panel under the grid). */
export function dayDetails(day: string): CalendarDay {
  return dayInfo(day, eventsBetween(day, day), true);
}
