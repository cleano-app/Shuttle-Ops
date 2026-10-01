import Link from "next/link";

/**
 * The phone "+" (owner, 1 Oct 2026: "new departure needs to be a + on
 * mobile"): a round button floating above the bottom tab bar, phones only.
 * Desktop pages show their normal labelled button instead.
 */
export function AddFab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="fixed end-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-dark text-white shadow-lg ring-4 ring-white/70 active:scale-95 md:hidden"
      style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}
