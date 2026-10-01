import { describe, expect, it } from "vitest";
import { zmanimFor } from "./zmanim";

describe("zmanim", () => {
  it("gives London and Antwerp times in their own zones", () => {
    const [lon, ant] = zmanimFor("2026-10-09");
    expect(lon.city).toBe("London");
    expect(lon.rows.find((r) => r.label.startsWith("Shkia"))?.time).toBe("18:20");
    expect(ant.rows.find((r) => r.label.startsWith("Shkia"))?.time).toBe("19:02");
  });
  it("adds candle lighting on Erev Shabbos and havdalah on Shabbos", () => {
    const [fri] = zmanimFor("2026-10-09");
    const [sat] = zmanimFor("2026-10-10");
    expect(fri.candles).not.toBeNull();
    expect(sat.havdalah).not.toBeNull();
    expect(zmanimFor("2026-10-07")[0].candles).toBeNull();
  });
});
