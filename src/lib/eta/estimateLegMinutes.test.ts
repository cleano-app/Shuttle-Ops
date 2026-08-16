import { describe, it, expect } from "vitest";
import { estimateLegMinutes, computeTimeBand, assessCheckinRisk } from "./estimateLegMinutes";

describe("estimateLegMinutes", () => {
  it("falls back to the template estimate when there's no history yet", () => {
    const result = estimateLegMinutes({ historical: null, templateDefaultMinutes: 20 });
    expect(result).toEqual({ minutes: 20, source: "template_estimate" });
  });

  it("falls back to the template estimate when sample_count is below the minimum", () => {
    const result = estimateLegMinutes({
      historical: { sample_count: 2, median_minutes: 15 },
      templateDefaultMinutes: 20,
      minimumSampleCount: 5,
    });
    expect(result).toEqual({ minutes: 20, source: "template_estimate" });
  });

  it("uses historical data once enough samples exist", () => {
    const result = estimateLegMinutes({
      historical: { sample_count: 8, median_minutes: 17 },
      templateDefaultMinutes: 20,
      minimumSampleCount: 5,
    });
    expect(result).toEqual({ minutes: 17, source: "historical" });
  });

  it("falls back when median_minutes is null even with enough samples", () => {
    const result = estimateLegMinutes({
      historical: { sample_count: 10, median_minutes: null },
      templateDefaultMinutes: 20,
    });
    expect(result.source).toBe("template_estimate");
  });
});

describe("computeTimeBand", () => {
  it("buckets into 3-hour bands", () => {
    expect(computeTimeBand(new Date("2026-01-01T07:15:00"))).toBe("06-09");
    expect(computeTimeBand(new Date("2026-01-01T00:00:00"))).toBe("00-03");
    expect(computeTimeBand(new Date("2026-01-01T23:59:00"))).toBe("21-00");
  });
});

describe("assessCheckinRisk", () => {
  const now = new Date("2026-01-01T07:00:00Z");

  it("returns null when there's no crossing stop", () => {
    const result = assessCheckinRisk(
      [{ sequence: 0, stop_type: "pickup", legMinutes: 10, actualArrivalAt: null, actualDepartureAt: null }],
      new Date("2026-01-01T09:00:00Z"),
      now
    );
    expect(result).toBeNull();
  });

  it("projects forward from `now` when nothing has actually departed yet, summing every leg from the start", () => {
    const result = assessCheckinRisk(
      [
        { sequence: 0, stop_type: "pickup", legMinutes: 20, actualArrivalAt: null, actualDepartureAt: null },
        { sequence: 1, stop_type: "crossing", legMinutes: 30, actualArrivalAt: null, actualDepartureAt: null },
      ],
      new Date("2026-01-01T08:00:00Z"),
      now
    );
    // No stop has an actual departure yet, so the anchor is `now` (07:00)
    // and every leg up to the crossing stop counts: 20 + 30 = 50 min ->
    // projected 07:50, deadline 08:00 -> 10 minutes to spare.
    expect(result?.atRisk).toBe(false);
    expect(result?.marginMinutes).toBe(10);
  });

  it("anchors from the last stop's actual departure time, not `now`", () => {
    const result = assessCheckinRisk(
      [
        {
          sequence: 0,
          stop_type: "pickup",
          legMinutes: 20,
          actualArrivalAt: "2026-01-01T06:40:00Z",
          actualDepartureAt: "2026-01-01T06:50:00Z",
        },
        { sequence: 1, stop_type: "crossing", legMinutes: 15, actualArrivalAt: null, actualDepartureAt: null },
      ],
      new Date("2026-01-01T07:00:00Z"),
      now
    );
    // Anchored at 06:50 (actual departure), + 15 min leg = 07:05, deadline 07:00 -> 5 min late.
    expect(result?.atRisk).toBe(true);
    expect(result?.marginMinutes).toBe(-5);
  });

  it("flags at risk when the projected arrival is after the deadline", () => {
    const result = assessCheckinRisk(
      [{ sequence: 0, stop_type: "crossing", legMinutes: 45, actualArrivalAt: null, actualDepartureAt: null }],
      new Date("2026-01-01T07:30:00Z"),
      now
    );
    expect(result?.atRisk).toBe(true);
    expect(result?.marginMinutes).toBe(-15);
  });
});
