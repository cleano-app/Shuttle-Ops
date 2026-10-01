"use client";

import { useRouter } from "next/navigation";

function shift(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ‹ day › with a calendar in the middle; changes `?day=` on `basePath`. */
export function DayPicker({ day, today, basePath }: { day: string; today: string; basePath: string }) {
  const router = useRouter();
  const go = (d: string) => router.push(d === today ? basePath : `${basePath}?day=${d}`);
  const btn = "flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg text-slate-700 active:bg-slate-100";
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Previous day" className={btn} onClick={() => go(shift(day, -1))}>
        ‹
      </button>
      <input
        type="date"
        value={day}
        onChange={(e) => e.target.value && go(e.target.value)}
        aria-label="Pick a day"
        className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm"
      />
      <button type="button" aria-label="Next day" className={btn} onClick={() => go(shift(day, 1))}>
        ›
      </button>
      {day !== today && (
        <button type="button" onClick={() => go(today)} className="text-sm font-medium text-brand-dark underline">
          Today
        </button>
      )}
    </div>
  );
}
