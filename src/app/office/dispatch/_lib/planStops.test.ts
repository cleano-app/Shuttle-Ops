import { describe, it, expect } from "vitest";
import {
  mergeStopOrder,
  assignSequences,
  planArrivalTimes,
  estimateLeg,
  utcTimeBand,
  type PlanStop,
  type TimingStop,
} from "./planStops";

function stop(partial: Partial<PlanStop> & Pick<PlanStop, "key" | "stopType">): PlanStop {
  return {
    isNew: true,
    areaId: null,
    areaOrder: null,
    country: "GB",
    label: partial.key,
    sequence: -1,
    fixed: false,
    ...partial,
  };
}

describe("mergeStopOrder", () => {
  it("orders a fresh departure pickups-by-area, crossing, then drop-offs", () => {
    const order = mergeStopOrder(
      [],
      [
        stop({ key: "drop-b", stopType: "dropoff", areaId: "B", areaOrder: 2 }),
        stop({ key: "pick-2", stopType: "pickup", areaId: "SH", areaOrder: 2 }),
        stop({ key: "cross", stopType: "crossing" }),
        stop({ key: "drop-a", stopType: "dropoff", areaId: "A", areaOrder: 1 }),
        stop({ key: "pick-1", stopType: "pickup", areaId: "GG", areaOrder: 1 }),
      ]
    );
    expect(order.map((s) => s.key)).toEqual(["pick-1", "pick-2", "cross", "drop-a", "drop-b"]);
  });

  it("keeps the dispatcher's existing order and slots a new pickup beside its area", () => {
    const existing = [
      stop({ key: "x2", isNew: false, sequence: 0, stopType: "pickup", areaId: "SH", areaOrder: 2 }),
      stop({ key: "x1", isNew: false, sequence: 1, stopType: "pickup", areaId: "GG", areaOrder: 1 }),
      stop({ key: "xc", isNew: false, sequence: 2, stopType: "crossing" }),
      stop({ key: "xd", isNew: false, sequence: 3, stopType: "dropoff", areaId: "A", areaOrder: 1 }),
    ];
    const order = mergeStopOrder(existing, [
      stop({ key: "new-sh", stopType: "pickup", areaId: "SH", areaOrder: 2 }),
      stop({ key: "new-drop", stopType: "dropoff", areaId: "B", areaOrder: 2 }),
    ]);
    expect(order.map((s) => s.key)).toEqual(["x2", "new-sh", "x1", "xc", "xd", "new-drop"]);
  });

  it("never puts a new stop before one the driver already visited", () => {
    const existing = [
      stop({ key: "done", isNew: false, sequence: 0, stopType: "pickup", areaId: "SH", areaOrder: 5, fixed: true, visited: true }),
    ];
    const order = mergeStopOrder(existing, [stop({ key: "n", stopType: "pickup", areaId: "GG", areaOrder: 1 })]);
    expect(order.map((s) => s.key)).toEqual(["done", "n"]);
  });
});

describe("assignSequences", () => {
  it("keeps locked stops' numbers and fills the rest around them", () => {
    const ordered = [
      stop({ key: "a", stopType: "pickup" }),
      stop({ key: "locked", isNew: false, sequence: 1, fixed: true, stopType: "crossing" }),
      stop({ key: "b", stopType: "pickup" }),
    ];
    const seq = assignSequences(ordered);
    expect(seq.get("locked")).toBe(1);
    expect(seq.get("a")).toBe(0);
    expect(seq.get("b")).toBe(2);
  });
});

describe("planArrivalTimes", () => {
  const departAt = new Date("2026-10-08T06:00:00Z");
  const t = (key: string, stopType: TimingStop["stopType"], areaId: string | null, country = "GB"): TimingStop => ({
    key,
    stopType,
    areaId,
    country,
    anchorAt: null,
  });

  it("starts at the departure time and adds dwell + estimated legs", () => {
    const times = planArrivalTimes(
      [t("a", "pickup", "SH"), t("b", "pickup", "SH"), t("c", "crossing", "FOLK")],
      departAt,
      [],
      new Map()
    );
    expect(times.get("a")).toBe("2026-10-08T06:00:00.000Z");
    // 3 min dwell + 5 min same-area leg
    expect(times.get("b")).toBe("2026-10-08T06:08:00.000Z");
    // 3 min dwell + 100 min default to the crossing
    expect(times.get("c")).toBe("2026-10-08T07:51:00.000Z");
  });

  it("prefers template offsets, then history with enough samples", () => {
    const from = t("a", "pickup", "SH");
    const to = t("b", "pickup", "GG");
    const at = new Date("2026-10-08T06:03:00Z");
    expect(estimateLeg(from, to, at, [], new Map([["SH", 0], ["GG", 12]]))).toEqual({
      minutes: 12,
      source: "template_estimate",
    });
    const hist = [
      {
        from_area_id: "SH",
        to_area_id: "GG",
        day_of_week: at.getUTCDay(),
        time_band: utcTimeBand(at),
        sample_count: 9,
        median_minutes: 17,
      },
    ];
    expect(estimateLeg(from, to, at, hist, new Map([["SH", 0], ["GG", 12]]))).toEqual({
      minutes: 17,
      source: "historical",
    });
  });
});
