// Shared interaction classes, ported from Cleano Ops's lib/tokens.ts.

/** Slight press-in on tap; touch-manipulation removes the 300ms delay. */
export const PRESS_CLASS = "touch-manipulation active:scale-[0.99] transition-transform duration-100";

/** Explicit teal focus ring for controls that override the global one. */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal";

const BUTTON_VARIANTS = {
  primary: "rounded-button bg-navy px-4 py-[13px] text-[15px] font-medium text-white hover:bg-brand disabled:opacity-50",
  accent: "rounded-button bg-teal px-4 py-[13px] text-[15px] font-medium text-white disabled:opacity-50",
  secondary:
    "rounded-button border border-border bg-white px-4 py-[13px] text-[15px] font-medium text-navy hover:bg-press disabled:opacity-50",
  destructive: "text-[13px] font-medium text-red underline disabled:opacity-50",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

/** Button look for a <button>, <Link> or <a> alike. */
export function buttonClasses(variant: ButtonVariant = "primary", fullWidth = true): string {
  const base = BUTTON_VARIANTS[variant];
  if (variant === "destructive") return base;
  return `${base} ${fullWidth ? "w-full" : "inline-flex items-center justify-center"} ${PRESS_CLASS}`;
}

/** Text input / select / textarea look (Cleano's Input). */
export const INPUT_CLASS = `w-full rounded-control border border-border bg-white px-3 py-2 text-base text-navy placeholder:text-muted ${FOCUS_RING_CLASS}`;

/** Field label. */
export const LABEL_CLASS = "mb-1 block text-sm font-medium text-navy";

/** White card on the page background. */
export const CARD_CLASS = "rounded-card border border-hairline bg-white shadow-card";
