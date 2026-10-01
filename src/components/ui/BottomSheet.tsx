"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Ported from Cleano Ops: slides up from the bottom on a phone (with a
 * swipe-down-to-close gesture), becomes a centred dialog from md up.
 * Escape and backdrop click close it; body scroll is locked while open.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  closeLabel = "Close",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** A string, or a node for a custom header (e.g. the menu's logo). */
  title: React.ReactNode;
  closeLabel?: string;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(raf);
      setVisible(false);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartY(e.touches[0].clientY);
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY == null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    setTouchStartY(null);
    if (deltaY > 80) onClose();
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl transition-transform duration-200 md:max-w-md md:rounded-2xl ${
          visible ? "translate-y-0" : "translate-y-full md:translate-y-0 md:opacity-0"
        }`}
      >
        {/* Swipe affordance - phone only. */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 md:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-navy">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
