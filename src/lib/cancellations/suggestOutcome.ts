import type { CancellationDepositAction, CancellationFareAction } from "@/types/database";

// Build spec §11: "The system may suggest an outcome based on notice
// given, but never executes it." This function ONLY returns a suggestion
// — src/app/actions/cancellations.ts stores it in cancellations.
// suggested_outcome and stops there; decided_outcome always requires an
// explicit Office action (decideCancellation), never this function's
// output copied over automatically. The exact notice-hours thresholds
// (48h/24h) aren't specified in the build spec itself - this is a
// reasonable, clearly-labelled starting policy Office can just override
// every time if it doesn't match reality; nothing about it is binding.

export interface SuggestOutcomeInput {
  noticeHours: number | null;
  isNoShow: boolean;
  hasStandingWaiver: boolean;
}

export interface SuggestedCancellationOutcome {
  code: string;
  depositAction: CancellationDepositAction;
  fareAction: CancellationFareAction;
  rationale: string;
}

export function suggestCancellationOutcome(input: SuggestOutcomeInput): SuggestedCancellationOutcome {
  if (input.hasStandingWaiver) {
    return {
      code: "waived_no_action",
      depositAction: "waive",
      fareAction: "no_charge",
      rationale: "Standing waiver on file — no automatic charge regardless of notice.",
    };
  }
  if (input.isNoShow) {
    return {
      code: "no_show_retain",
      depositAction: "retain",
      fareAction: "no_charge",
      rationale: "No-show — suggest retaining the deposit. Office decides the final outcome.",
    };
  }
  if (input.noticeHours == null) {
    return {
      code: "unknown_notice",
      depositAction: "retain",
      fareAction: "no_charge",
      rationale: "Notice period unknown — defaulting to a cautious suggestion.",
    };
  }
  if (input.noticeHours >= 48) {
    return {
      code: "full_notice_release",
      depositAction: "release",
      fareAction: "no_charge",
      rationale: "48+ hours' notice — suggest releasing the deposit in full.",
    };
  }
  if (input.noticeHours >= 24) {
    return {
      code: "short_notice_release",
      depositAction: "release",
      fareAction: "no_charge",
      rationale: "24-48 hours' notice — still suggest releasing the deposit.",
    };
  }
  return {
    code: "late_notice_retain",
    depositAction: "retain",
    fareAction: "no_charge",
    rationale: "Under 24 hours' notice — suggest retaining the deposit.",
  };
}
