import { describe, it, expect } from "vitest";
import { suggestCancellationOutcome } from "./suggestOutcome";

describe("suggestCancellationOutcome", () => {
  it("waives regardless of notice when a standing waiver is on file", () => {
    const result = suggestCancellationOutcome({ noticeHours: 1, isNoShow: false, hasStandingWaiver: true });
    expect(result.code).toBe("waived_no_action");
    expect(result.depositAction).toBe("waive");
  });

  it("waives even for a no-show, when a standing waiver is on file", () => {
    const result = suggestCancellationOutcome({ noticeHours: null, isNoShow: true, hasStandingWaiver: true });
    expect(result.code).toBe("waived_no_action");
  });

  it("suggests retaining the deposit for a no-show with no waiver", () => {
    const result = suggestCancellationOutcome({ noticeHours: 72, isNoShow: true, hasStandingWaiver: false });
    expect(result.code).toBe("no_show_retain");
    expect(result.depositAction).toBe("retain");
  });

  it("defaults to a cautious retain suggestion when notice is unknown", () => {
    const result = suggestCancellationOutcome({ noticeHours: null, isNoShow: false, hasStandingWaiver: false });
    expect(result.code).toBe("unknown_notice");
    expect(result.depositAction).toBe("retain");
  });

  it("releases in full at exactly 48 hours' notice (boundary)", () => {
    const result = suggestCancellationOutcome({ noticeHours: 48, isNoShow: false, hasStandingWaiver: false });
    expect(result.code).toBe("full_notice_release");
    expect(result.depositAction).toBe("release");
  });

  it("still releases just under 48 hours (short notice band)", () => {
    const result = suggestCancellationOutcome({ noticeHours: 47.9, isNoShow: false, hasStandingWaiver: false });
    expect(result.code).toBe("short_notice_release");
  });

  it("releases at exactly 24 hours' notice (boundary)", () => {
    const result = suggestCancellationOutcome({ noticeHours: 24, isNoShow: false, hasStandingWaiver: false });
    expect(result.code).toBe("short_notice_release");
    expect(result.depositAction).toBe("release");
  });

  it("suggests retaining just under 24 hours' notice", () => {
    const result = suggestCancellationOutcome({ noticeHours: 23.9, isNoShow: false, hasStandingWaiver: false });
    expect(result.code).toBe("late_notice_retain");
    expect(result.depositAction).toBe("retain");
  });

  it("suggests retaining for zero/negative notice", () => {
    const result = suggestCancellationOutcome({ noticeHours: 0, isNoShow: false, hasStandingWaiver: false });
    expect(result.code).toBe("late_notice_retain");
  });

  it("never suggests a fare charge — spec fareAction is always no_charge for now", () => {
    for (const noticeHours of [null, 0, 10, 24, 48, 100]) {
      const result = suggestCancellationOutcome({ noticeHours, isNoShow: false, hasStandingWaiver: false });
      expect(result.fareAction).toBe("no_charge");
    }
  });
});
