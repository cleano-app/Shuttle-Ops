/** A quiet one-liner for an empty list (Cleano Ops's EmptyState). */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-muted">{children}</p>;
}
