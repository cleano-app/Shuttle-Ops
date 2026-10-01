"use client";

import { useEffect, useRef, useState } from "react";
import { recordMyLocation } from "@/app/actions/driverLocation";

const SEND_EVERY_MS = 45_000;

type State = "starting" | "on" | "denied" | "unavailable";

/**
 * Sends the driver's position for the Office dashboard map while the route
 * screen is open (owner, 1 Oct 2026). Same pattern as Cleano's worker
 * LocationTracker. A web page can't track with the phone locked; the fix
 * resumes as soon as the driver opens the app again. Never blocks the
 * route screen: a refused or failed fix only changes the little status line.
 */
export function DriverLocationTracker({ departureId, active }: { departureId: string; active: boolean }) {
  const [state, setState] = useState<State>("starting");
  const lastSent = useRef(0);

  useEffect(() => {
    if (!active) return;
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => setState("unavailable"));
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setState("on");
        const now = Date.now();
        if (now - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = now;
        void recordMyLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          departureId,
        });
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [active, departureId]);

  if (!active) return null;
  return (
    <p className="flex items-center gap-2 px-4 py-2 text-xs text-slate-500">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${
          state === "on" ? "bg-emerald-500" : state === "starting" ? "bg-amber-400" : "bg-red-500"
        }`}
      />
      {state === "on" && "Sharing your location with the office while this screen is open"}
      {state === "starting" && "Finding your location…"}
      {state === "denied" && "Location is blocked — allow it for this site in your browser settings so the office can see the van"}
      {state === "unavailable" && "Location unavailable on this device right now"}
    </p>
  );
}
