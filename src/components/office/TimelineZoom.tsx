"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const MIN = 18;
const MAX = 140;
const KEY = "shuttle.dayZoom";

/**
 * Google-Calendar-style zoom for the day timeline (owner, 1 Oct 2026:
 * "more squeezed, extendable by zooming"). The timeline is drawn with
 * calc(var(--hour) * n), so changing --hour rescales everything at once.
 * Pinch with two fingers, the − / + buttons, or Ctrl + mouse wheel.
 * Remembers the level on this device and opens scrolled to the first
 * departure (or now, today).
 */
export function TimelineZoom({ children }: { children: ReactNode }) {
  const [hour, setHour] = useState(28);
  const ref = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ dist: number; hour: number } | null>(null);
  const hourRef = useRef(hour);


  // Saved zoom level (per device).
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if (saved >= MIN && saved <= MAX) queueMicrotask(() => setHour(saved));
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  useEffect(() => {
    hourRef.current = hour;
    try {
      localStorage.setItem(KEY, String(Math.round(hour)));
    } catch {
      /* ignore */
    }
  }, [hour]);

  // Open at the first departure / the now line.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-scroll-anchor]");
    if (!el) return;
    const t = setTimeout(() => {
      const y = el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3;
      window.scrollTo({ top: Math.max(0, y) });
    }, 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch.current = { dist: dist(e.touches), hour: hourRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault();
      setHour(clamp(pinch.current.hour * (dist(e.touches) / pinch.current.dist)));
    };
    const onEnd = () => {
      pinch.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setHour((h) => clamp(h * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-40";

  return (
    <div ref={ref} style={{ ["--hour" as string]: `${hour}px` }}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <span className="text-xs text-slate-500">Pinch or use − / + to zoom</span>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Zoom out" className={btn} disabled={hour <= MIN} onClick={() => setHour((h) => Math.max(MIN, h / 1.35))}>
            −
          </button>
          <button type="button" aria-label="Zoom in" className={btn} disabled={hour >= MAX} onClick={() => setHour((h) => Math.min(MAX, h * 1.35))}>
            +
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
