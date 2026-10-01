"use client";

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  /** What is being counted, for the buttons' accessible names ("Man", "Large luggage"). */
  label: string;
  min?: number;
  max?: number;
  /** Force the minus button off (e.g. nothing can be removed) even above `min`. */
  minusDisabled?: boolean;
  disabled?: boolean;
}

/**
 * Big − n + counter, after Cleano Ops's bin steppers: 44px touch targets
 * either side of the value, so a quantity is a tap rather than typing into
 * a number box on a phone keyboard.
 */
export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 99,
  minusDisabled = false,
  disabled = false,
}: StepperProps) {
  const canMinus = !disabled && !minusDisabled && value > min;
  const canPlus = !disabled && value < max;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        disabled={!canMinus}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-11 w-11 rounded-lg border border-slate-300 bg-white text-xl leading-none text-slate-800 active:bg-slate-100 disabled:opacity-30"
      >
        −
      </button>
      <span
        aria-live="polite"
        className="min-w-[2ch] px-1 text-center text-lg font-semibold tabular-nums text-slate-900"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`One more ${label}`}
        disabled={!canPlus}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="h-11 w-11 rounded-lg border border-blue-900 bg-blue-50 text-xl leading-none text-blue-900 active:bg-blue-100 disabled:opacity-30"
      >
        +
      </button>
    </span>
  );
}
