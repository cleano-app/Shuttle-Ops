import { CARD_CLASS } from "./classes";

/**
 * Cleano Ops's Card: white, 12px radius, hairline border, two-layer card
 * shadow. `padded={false}` for content that runs edge to edge (lists of
 * rows) - a prop rather than overriding p-4 via className, because
 * Tailwind's stylesheet order, not class order, decides which wins.
 */
export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`${CARD_CLASS} ${padded ? "p-4" : ""} ${className}`}>{children}</div>;
}
