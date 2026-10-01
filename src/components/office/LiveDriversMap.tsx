"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMapsScript } from "@/lib/googleMaps";
import { getLiveDriverLocations, type LiveDriverLocation } from "@/app/actions/driverLocation";

const POLL_MS = 30_000;
// Between London and Antwerp, zoomed to show both.
const DEFAULT_CENTER = { lat: 51.3, lng: 2.2 };

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
}

/**
 * Where the vans are (owner, 1 Oct 2026). Copied from Cleano Ops's
 * LiveWorkersMap: polls every 30s and moves markers in place instead of
 * redrawing the map. Without a Maps key (or if Google refuses it) the list
 * below still works, each driver linking out to Google Maps.
 */
export function LiveDriversMap({
  apiKey,
  initialLocations,
}: {
  apiKey?: string;
  initialLocations: LiveDriverLocation[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markers = useRef<Map<string, google.maps.Marker>>(new Map());
  const [locations, setLocations] = useState(initialLocations);
  const [mapError, setMapError] = useState<string | null>(apiKey ? null : "no-key");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!apiKey || !mapRef.current) return;
    let cancelled = false;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        mapInstance.current = new google.maps.Map(mapRef.current, {
          zoom: 7,
          center: DEFAULT_CENTER,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        setReady(true);
      })
      .catch((err: Error) => setMapError(err.message));
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    const bounds = new google.maps.LatLngBounds();
    for (const loc of locations) {
      seen.add(loc.driverId);
      const position = { lat: loc.lat, lng: loc.lng };
      bounds.extend(position);
      const title = `${loc.driverName}${loc.vehicle ? ` · ${loc.vehicle}` : ""} · ${ago(loc.recordedAt)}`;
      const existing = markers.current.get(loc.driverId);
      if (existing) {
        existing.setPosition(position);
        existing.setTitle(title);
      } else {
        markers.current.set(
          loc.driverId,
          new google.maps.Marker({
            position,
            map,
            title,
            label: { text: loc.driverName.slice(0, 1).toUpperCase(), color: "#fff", fontWeight: "700" },
          })
        );
      }
    }
    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.setMap(null);
        markers.current.delete(id);
      }
    }
    if (locations.length === 1) {
      map.setCenter({ lat: locations[0].lat, lng: locations[0].lng });
      map.setZoom(11);
    } else if (locations.length > 1) {
      map.fitBounds(bounds, 60);
    }
  }, [locations, ready]);

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await getLiveDriverLocations();
      if (!res.error) setLocations(res.locations);
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      {apiKey && !mapError && <div ref={mapRef} className="h-72 w-full bg-slate-100 md:h-96" />}
      {mapError && mapError !== "no-key" && (
        <p className="border-b border-slate-200 bg-amber-50 p-3 text-xs text-amber-800">
          The map couldn&apos;t load ({mapError}). Locations are still listed below.
        </p>
      )}
      {locations.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">
          No driver is sharing a location right now. It appears while a driver has their route open.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {locations.map((loc) => (
            <li key={loc.driverId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                <span className="font-medium text-slate-900">{loc.driverName}</span>
                {loc.vehicle && <span className="text-slate-500"> · {loc.vehicle}</span>}
                <span className="text-slate-500"> · {ago(loc.recordedAt)}</span>
              </span>
              <a
                href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-dark underline"
              >
                Open in Google Maps
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
