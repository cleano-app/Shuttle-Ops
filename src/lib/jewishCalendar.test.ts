import { describe, expect, it } from "vitest";
import { dayDetails, monthGrid } from "./jewishCalendar";

describe("jewish calendar", () => {
  it("gives the Hebrew date and Chol Hamoed for 1 Oct 2026", () => {
    const d = dayDetails("2026-10-01");
    expect(d.hebLabel).toBe("20 Tishrei 5787");
    expect(d.hebDay).toBe("כ");
    expect(d.events.map((e) => e.label)).toContain("Chol Hamoed");
  });

  it("marks Shmini Atzeres as Yom Tov and Shabbos", () => {
    const d = dayDetails("2026-10-03");
    expect(d.isShabbos).toBe(true);
    expect(d.isYomTov).toBe(true);
    expect(d.events.map((e) => e.label)).toContain("Shmini Atzeres");
  });

  it("shows the parsha on a plain Shabbos", () => {
    expect(dayDetails("2026-10-10").events.map((e) => e.label)).toContain("Bereshis");
  });

  it("builds the Tishrei 5787 month as Sunday-first weeks", () => {
    const g = monthGrid("hebrew", "2026-10-01");
    expect(g.title).toBe("Tishrei 5787");
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    const inMonth = g.weeks.flat().filter((d) => d.inMonth);
    expect(inMonth[0].date).toBe("2026-09-12"); // 1 Tishrei = Rosh Hashana
    expect(inMonth.at(-1)!.hebLabel).toBe("30 Tishrei 5787");
  });

  it("builds a regular month", () => {
    const g = monthGrid("regular", "2026-10-15");
    expect(g.title).toBe("October 2026");
    expect(g.weeks.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });
});
