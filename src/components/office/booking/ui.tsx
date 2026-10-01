import type { ReactNode } from "react";

// One look for every card on the Booking Console (owner, 1 Oct 2026:
// "messy, need more tidy"): same card, same numbered heading, same inputs.

/** Text inputs and selects. 16px on phones so Android/iOS don't zoom in. */
export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 md:py-2 md:text-sm";

/** Small secondary action (New call, Change caller, + New passenger...). */
export const outlineButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40";

export function Card({
  step,
  title,
  action,
  children,
  className = "",
}: {
  step?: number;
  title: string;
  /** Right-hand side of the heading row (a small button or select). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          {step != null && (
            <span
              aria-hidden
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white"
            >
              {step}
            </span>
          )}
          {step != null && <span className="sr-only">Step {step}: </span>}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Collapsed-by-default extra detail ("Add names (optional)" etc.). */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group mt-3 border-t border-slate-100 pt-2" open={defaultOpen || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-blue-900 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
          ›
        </span>
        {summary}
      </summary>
      <div className="mt-2 space-y-3">{children}</div>
    </details>
  );
}

/** Label on the left, control (usually a Stepper) on the right. */
export function StepperRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
