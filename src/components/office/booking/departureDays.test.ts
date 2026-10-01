import { describe, expect, it } from "vitest";
import { addDays, dayChipLabel, departureDays, journeyKey, journeysOf, oppositeDirection, ukDayKey, ukTime } from "./departureDays";

const dep = (id: string, direction: string, depart_at: string, seatsLeft: number | null = 10) => ({
  id,
  direction,
  depart_at,
  route_id: "r1",
  routeName: "London ⇄ Antwerp",
  seatsLeft,
});

describe("departure day picker helpers", () => {
  it("uses UK calendar days", () => {
    // 23:30 UTC on 3 Oct is 00:30 on 4 Oct in British Summer Time.
    expect(ukDayKey("2026-10-03T23:30:00Z")).toBe("2026-10-04");
    expect(ukTime("2026-10-03T23:30:00Z")).toBe("00:30");
    expect(ukDayKey("2026-12-03T23:30:00Z")).toBe("2026-12-03");
  });

  it("labels chips like Sun 4 Oct", () => {
    expect(dayChipLabel("2026-10-04")).toEqual({ weekday: "Sun", date: "4 Oct" });
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });

  it("lists journeys outbound first", () => {
    const js = journeysOf([dep("a", "return", "2026-10-04T12:00:00Z"), dep("b", "outbound", "2026-10-05T12:00:00Z")]);
    expect(js.map((j) => j.direction)).toEqual(["outbound", "return"]);
    expect(oppositeDirection("outbound")).toBe("return");
  });

  it("groups one journey's departures by day within the window", () => {
    const list = [
      dep("a", "outbound", "2026-10-04T07:00:00Z", 3),
      dep("b", "outbound", "2026-10-04T13:00:00Z", 0),
      dep("c", "return", "2026-10-04T13:00:00Z"),
      dep("d", "outbound", "2026-10-06T07:00:00Z", 0),
      dep("e", "outbound", "2026-12-20T07:00:00Z"),
    ];
    const days = departureDays(list, journeyKey("r1", "outbound"), "2026-10-02");
    expect(days.map((d) => d.day)).toEqual(["2026-10-04", "2026-10-06"]);
    expect(days[0]).toMatchObject({ seatsLeft: 3, full: false });
    expect(days[0].departures.map((d) => d.id)).toEqual(["a", "b"]);
    expect(days[1].full).toBe(true);
    // Return leg: only days on/after the outbound day.
    expect(departureDays(list, journeyKey("r1", "outbound"), "2026-10-05").map((d) => d.day)).toEqual(["2026-10-06"]);
    // Nothing in the window: falls back to the next days that have one.
    expect(departureDays(list, journeyKey("r1", "outbound"), "2026-11-01").map((d) => d.day)).toEqual(["2026-12-20"]);
  });
});
