const TONE_CLASSES = {
  neutral: "bg-page text-muted",
  amber: "bg-amber-bg text-amber-text",
  teal: "bg-teal-bg text-teal-text",
  green: "bg-green-bg text-green",
  red: "bg-red-bg text-red",
} as const;

/** Cleano Ops's status chip: small pill, tone by meaning. */
export function Chip({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: keyof typeof TONE_CLASSES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
