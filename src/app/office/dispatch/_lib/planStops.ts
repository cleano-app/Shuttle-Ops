// Pure planning helpers for "Generate / Update stops from bookings".
// Kept free of Supabase so the ordering and timing rules are unit-tested
// (planStops.test.ts) rather than only exercised by clicking.
//
// Ordering rule (build spec §17/§20): area running_order gives the basic
// route sequence - pickups first in area order, then the crossing, then
// drop-offs in area order. When a departure already has stops, the
// dispatcher's order is kept: new stops slot in beside existing stops in
// the same area, or by area order, and never move a locked or already-
// visited stop.

export type PlanStopType = "pickup" | "dropoff" | "crossing" | "waypoint";

export interface PlanStop {
  /** Existing stop id, or a temporary key for a stop about to be created. */
  key: string;
  isNew: boolean;
  stopType: PlanStopType;
  areaId: string | null;
  /** areas.running_order; null when the address has no area. */
  areaOrder: number | null;
  country: string | null;
  /** Tie-breaker for stable ordering inside an area (e.g. postcode + line1). */
  label: string;
  /** Existing planned_sequence (ignored for new stops). */
  sequence: number;
  /** Locked by the dispatcher, or already arrived/completed by a driver -
   * its sequence number never changes. */
  fixed: boolean;
  /** A driver has already arrived at / completed this stop. */
  visited?: boolean;
}

function phase(t: PlanStopType): number {
  if (t === "pickup") return 0;
  if (t === "dropoff") return 2;
  return 1;
}

function compareKey(a: PlanStop, b: PlanStop): number {
  const p = phase(a.stopType) - phase(b.stopType);
  if (p !== 0) return p;
  const ao = a.areaOrder ?? Number.MAX_SAFE_INTEGER;
  const bo = b.areaOrder ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.label.localeCompare(b.label);
}

/**
 * Returns every stop (existing first-class, additions slotted in) in the
 * order they should run. Existing stops keep their relative order.
 */
export function mergeStopOrder(existing: PlanStop[], additions: PlanStop[]): PlanStop[] {
  const order = [...existing].sort((a, b) => a.sequence - b.sequence);
  const sortedAdditions = [...additions].sort(compareKey);

  for (const add of sortedAdditions) {
    const crossingIdx = order.map((s, i) => (s.stopType === "crossing" ? i : -1)).filter((i) => i >= 0);
    // Nothing new goes before a stop the driver has already reached.
    let lo = 0;
    order.forEach((s, i) => {
      if (s.visited) lo = Math.max(lo, i + 1);
    });
    let hi = order.length;
    if (add.stopType === "pickup" && crossingIdx.length > 0) hi = Math.min(hi, crossingIdx[0]);
    if (add.stopType === "dropoff" && crossingIdx.length > 0) lo = Math.max(lo, crossingIdx[crossingIdx.length - 1] + 1);
    if (add.stopType === "crossing") {
      // Between the last pickup and the first drop-off.
      const lastPickup = order.map((s, i) => (s.stopType === "pickup" ? i : -1)).filter((i) => i >= 0).pop();
      const firstDropoff = order.findIndex((s) => s.stopType === "dropoff");
      let pos = lastPickup !== undefined ? lastPickup + 1 : 0;
      if (firstDropoff >= 0 && firstDropoff < pos) pos = firstDropoff;
      order.splice(Math.max(lo, Math.min(pos, order.length)), 0, add);
      continue;
    }
    if (hi < lo) hi = lo;

    const opposite = add.stopType === "pickup" ? "dropoff" : add.stopType === "dropoff" ? "pickup" : null;
    let pos = -1;

    // 1. Beside the last existing stop in the same area.
    if (add.areaId) {
      for (let i = lo; i < hi; i++) {
        const s = order[i];
        if (s.areaId === add.areaId && s.stopType !== opposite && s.stopType !== "crossing") pos = i + 1;
      }
    }
    // 2. Otherwise by phase + area running order.
    if (pos === -1) {
      pos = lo;
      for (let i = lo; i < hi; i++) {
        if (compareKey(order[i], add) <= 0) pos = i + 1;
      }
    }
    pos = Math.max(lo, Math.min(pos, hi));
    order.splice(pos, 0, add);
  }
  return order;
}

/**
 * planned_sequence per stop. Fixed stops keep theirs; everything else takes
 * the lowest free numbers, in merged order.
 */
export function assignSequences(ordered: PlanStop[]): Map<string, number> {
  const result = new Map<string, number>();
  const taken = new Set<number>();
  for (const s of ordered) {
    if (s.fixed && !s.isNew) {
      result.set(s.key, s.sequence);
      taken.add(s.sequence);
    }
  }
  let next = 0;
  for (const s of ordered) {
    if (result.has(s.key)) continue;
    while (taken.has(next)) next++;
    result.set(s.key, next);
    taken.add(next);
  }
  return result;
}

export interface LegTimingRow {
  from_area_id: string;
  to_area_id: string;
  day_of_week: number;
  time_band: string;
  sample_count: number;
  median_minutes: number | null;
}

export interface TimingStop {
  key: string;
  stopType: PlanStopType;
  areaId: string | null;
  country: string | null;
  /** A time that must be kept (locked stop with a time, or an actual
   * departure/arrival) - later stops are projected from it. */
  anchorAt: string | null;
}

/** Minutes spent at a stop before driving on. */
export const DWELL_MINUTES = 3;
const MIN_HISTORICAL_SAMPLES = 5;

/** UTC 3-hour band, matching recompute_leg_timings() (0047), which buckets
 * by the database's UTC clock. */
export function utcTimeBand(date: Date): string {
  const start = Math.floor(date.getUTCHours() / 3) * 3;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(start)}-${pad((start + 3) % 24)}`;
}

/**
 * Default leg length when there is no history and no template timing -
 * deliberately rough; the dispatch board labels every time as an estimate.
 */
export function defaultLegMinutes(from: TimingStop, to: TimingStop): number {
  if (to.stopType === "crossing") return from.areaId && from.areaId === to.areaId ? 5 : 100;
  if (from.stopType === "crossing") return 150;
  if (from.areaId && from.areaId === to.areaId) return 5;
  if (from.country && to.country && from.country !== to.country) return 240;
  return 15;
}

export interface LegEstimate {
  minutes: number;
  source: "historical" | "template_estimate" | "default_estimate";
}

export function estimateLeg(
  from: TimingStop,
  to: TimingStop,
  at: Date,
  legTimings: LegTimingRow[],
  templateOffsets: Map<string, number>
): LegEstimate {
  if (from.areaId && to.areaId) {
    const band = utcTimeBand(at);
    const dow = at.getUTCDay();
    const hist = legTimings.find(
      (l) =>
        l.from_area_id === from.areaId &&
        l.to_area_id === to.areaId &&
        l.day_of_week === dow &&
        l.time_band === band
    );
    if (hist && hist.median_minutes != null && hist.sample_count >= MIN_HISTORICAL_SAMPLES) {
      return { minutes: hist.median_minutes, source: "historical" };
    }
    const a = templateOffsets.get(from.areaId);
    const b = templateOffsets.get(to.areaId);
    if (a != null && b != null && b > a) {
      return { minutes: b - a, source: "template_estimate" };
    }
  }
  return { minutes: defaultLegMinutes(from, to), source: "default_estimate" };
}

/**
 * Planned arrival per stop: the first stop at the departure time, each
 * later one after the previous stop's dwell plus the estimated leg. A stop
 * with an anchor time keeps it and re-bases everything after it.
 */
export function planArrivalTimes(
  ordered: TimingStop[],
  departAt: Date,
  legTimings: LegTimingRow[],
  templateOffsets: Map<string, number>
): Map<string, string> {
  const out = new Map<string, string>();
  let prev: TimingStop | null = null;
  let prevAt = departAt;
  for (const stop of ordered) {
    let at: Date;
    if (stop.anchorAt) {
      at = new Date(stop.anchorAt);
    } else if (!prev) {
      at = departAt;
    } else {
      const leaveAt = new Date(prevAt.getTime() + DWELL_MINUTES * 60_000);
      const leg = estimateLeg(prev, stop, leaveAt, legTimings, templateOffsets);
      at = new Date(leaveAt.getTime() + leg.minutes * 60_000);
    }
    out.set(stop.key, at.toISOString());
    prev = stop;
    prevAt = at;
  }
  return out;
}
