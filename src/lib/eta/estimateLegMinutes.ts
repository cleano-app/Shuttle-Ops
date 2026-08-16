// Historical operational ETA (build spec §19) — no live traffic API. This
// module is the single place that decides "how long does this leg
// probably take", so the UI can label it consistently and correctly:
// "historical" (based on this shuttle's own past runs) must never read as
// live traffic, and "template_estimate" (no history yet) must always read
// as an estimate. leg_timings only gets populated by a nightly job that is
// explicitly Phase 4 (§39) — until then every leg falls back to its route
// template's default_offset_minutes, exactly as §19 describes.

export interface LegTimingLike {
  sample_count: number;
  median_minutes: number | null;
}

export interface EstimateLegMinutesInput {
  /** The leg_timings row matching this from/to area + day_of_week +
   * time_band, if one exists. */
  historical: LegTimingLike | null;
  templateDefaultMinutes: number;
  /** Below this many samples, historical data is too thin to trust over
   * the template's estimate - Phase 4's nightly job decides real sample
   * sizes; this is a conservative floor. */
  minimumSampleCount?: number;
}

export interface EstimateLegMinutesResult {
  minutes: number;
  source: "historical" | "template_estimate";
}

export function estimateLegMinutes(input: EstimateLegMinutesInput): EstimateLegMinutesResult {
  const minSamples = input.minimumSampleCount ?? 5;
  if (
    input.historical &&
    input.historical.median_minutes != null &&
    input.historical.sample_count >= minSamples
  ) {
    return { minutes: input.historical.median_minutes, source: "historical" };
  }
  return { minutes: input.templateDefaultMinutes, source: "template_estimate" };
}

/** Buckets a time of day into a 3-hour band, e.g. "06-09". Coarse by
 * design - leg_timings' sample counts will be thin for a while yet, and a
 * finer band just spreads those same samples thinner. */
export function computeTimeBand(date: Date): string {
  const hour = date.getHours();
  const bandStart = Math.floor(hour / 3) * 3;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(bandStart)}-${pad((bandStart + 3) % 24)}`;
}

export interface StopEtaInput {
  sequence: number;
  stop_type: string;
  /** Minutes to travel to reach THIS stop from the previous one — already
   * resolved via estimateLegMinutes() by the caller. */
  legMinutes: number;
  actualArrivalAt: string | null;
  actualDepartureAt: string | null;
}

export interface CheckinRiskResult {
  atRisk: boolean;
  projectedArrivalAt: Date;
  /** Positive = margin before deadline, negative = minutes over. */
  marginMinutes: number;
}

/**
 * Build spec §20: "The system warns when projected arrival risks missing
 * the crossing check-in deadline." Projects forward from the last
 * completed stop's actual departure time (or `now` if no stop has been
 * completed yet) through the remaining legs' estimated minutes up to the
 * crossing stop. Returns null if there's no crossing stop in the list.
 */
export function assessCheckinRisk(
  stops: StopEtaInput[],
  checkinDeadline: Date,
  now: Date = new Date()
): CheckinRiskResult | null {
  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence);
  const crossingIndex = sorted.findIndex((s) => s.stop_type === "crossing");
  if (crossingIndex === -1) return null;

  // Anchor point: the actual departure time of the last stop that's
  // genuinely finished, or `now` if the run hasn't started/no stop is
  // complete yet - either way we only sum estimated minutes for legs that
  // haven't actually happened yet.
  let anchor = now;
  let anchorIndex = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].actualDepartureAt) {
      anchor = new Date(sorted[i].actualDepartureAt!);
      anchorIndex = i;
    }
  }

  let projected = new Date(anchor);
  for (let i = anchorIndex + 1; i <= crossingIndex; i++) {
    projected = new Date(projected.getTime() + sorted[i].legMinutes * 60_000);
  }

  const marginMinutes = Math.round((checkinDeadline.getTime() - projected.getTime()) / 60_000);
  return {
    atRisk: marginMinutes < 0,
    projectedArrivalAt: projected,
    marginMinutes,
  };
}
