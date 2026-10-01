import { describe, expect, it } from "vitest";
import { formatUk, isoToUkLocal, ukLocalToIso } from "./time";

describe("UK time helpers", () => {
  it("reads a summer wall-clock time as BST", () => {
    expect(ukLocalToIso("2026-10-08T07:00")).toBe("2026-10-08T06:00:00.000Z");
  });

  it("reads a winter wall-clock time as GMT", () => {
    expect(ukLocalToIso("2026-12-01T07:00")).toBe("2026-12-01T07:00:00.000Z");
  });

  it("round-trips through datetime-local", () => {
    expect(isoToUkLocal("2026-10-08T06:00:00.000Z")).toBe("2026-10-08T07:00");
    expect(isoToUkLocal("2026-12-01T07:00:00.000Z")).toBe("2026-12-01T07:00");
  });

  it("returns null for empty input", () => {
    expect(ukLocalToIso("")).toBeNull();
  });

  it("formats in UK time whatever the server zone", () => {
    expect(formatUk("2026-10-08T06:00:00.000Z", { time: "short" })).toBe("07:00");
  });
});
