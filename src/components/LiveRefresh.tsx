"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current server page every `seconds` while the tab is
 * visible, so a dashboard stays live without anyone pressing refresh.
 * Paused in a background tab; catches up as soon as it's shown again.
 */
export function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setUpdated(new Date());
    };
    const id = setInterval(tick, seconds * 1000);
    const onShow = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router, seconds]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span aria-hidden className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live
      {updated && (
        <> · updated {updated.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}</>
      )}
    </span>
  );
}
