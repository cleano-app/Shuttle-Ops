"use client";

import { useEffect, useState } from "react";
import { subscribeQueue, type QueuedAction } from "./queue";

export interface OfflineQueueStatus {
  pendingCount: number;
  online: boolean;
  hasErrors: boolean;
}

/** Drives the driver screen's sync indicator (build spec §24: "Visible
 * sync indicator" - a driver in the tunnel needs to know their taps
 * registered). */
export function useOfflineQueueStatus(): OfflineQueueStatus {
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  // Lazy initializer reads the real value on first client render instead
  // of setting it from inside the effect below (avoids an extra render
  // pass just to correct an SSR-only default).
  const [online, setOnline] = useState(() =>
    typeof window === "undefined" ? true : window.navigator.onLine
  );

  useEffect(() => {
    const unsubscribe = subscribeQueue(setQueue);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return {
    pendingCount: queue.length,
    online,
    hasErrors: queue.some((a) => a.attempts > 0),
  };
}
