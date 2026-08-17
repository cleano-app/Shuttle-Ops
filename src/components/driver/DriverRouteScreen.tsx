"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  arriveAtStop,
  departStop,
  reportStopProblem,
  markPassengerBoarded,
  logDutyEvent,
  getMyStopManifest,
  collectParcel,
  deliverParcel,
  reportParcelFailed,
} from "@/app/actions/driver";
import { enqueueAction, registerExecutor, initOfflineQueue, type QueuedAction } from "@/lib/offline/queue";
import { useOfflineQueueStatus } from "@/lib/offline/useOfflineQueue";
import type { DriverStopManifest, DutyEventType } from "@/types/database";

interface DriverRouteScreenProps {
  departureId: string;
  vehicleId: string;
  initialManifest: DriverStopManifest;
  crossingReference: string | null;
  crossingCheckinDeadline: string | null;
}

const DUTY_EVENTS: { type: DutyEventType; label: string }[] = [
  { type: "start", label: "Start" },
  { type: "break", label: "Break" },
  { type: "fuel", label: "Fuel" },
  { type: "border", label: "Border" },
  { type: "end", label: "End duty" },
];

/**
 * Build spec §31: driver sees only their assigned vehicle, departure and
 * segment. One primary action per stop, no page transitions between
 * stops - after completing one, the next assigned stop appears in the
 * same screen. Navigate opens the device's own maps app via a deep link
 * rather than any embedded map (spec §2: no mapping/routing API in this
 * system at all).
 */
export function DriverRouteScreen({
  departureId,
  vehicleId,
  initialManifest,
  crossingReference,
  crossingCheckinDeadline,
}: DriverRouteScreenProps) {
  const [manifest, setManifest] = useState<DriverStopManifest>(initialManifest);
  const [problemNote, setProblemNote] = useState("");
  const [showProblemFor, setShowProblemFor] = useState<string | null>(null);
  const { pendingCount, online, hasErrors } = useOfflineQueueStatus();

  useEffect(() => {
    initOfflineQueue();
    registerExecutor(async (action: QueuedAction) => {
      switch (action.type) {
        case "arrive_stop": {
          const p = action.payload as { stopId: string; clientId: string };
          return arriveAtStop({ stopId: p.stopId, clientId: p.clientId });
        }
        case "depart_stop": {
          const p = action.payload as { stopId: string };
          return departStop(p.stopId);
        }
        case "problem_stop": {
          const p = action.payload as { stopId: string; note: string };
          return reportStopProblem(p.stopId, p.note);
        }
        case "board_passenger": {
          const p = action.payload as { operationalStopPassengerId: string; boarded: boolean; noShow: boolean };
          return markPassengerBoarded(p.operationalStopPassengerId, p.boarded, p.noShow);
        }
        case "duty_event": {
          const p = action.payload as {
            clientId: string;
            eventType: DutyEventType;
            odometer: number | null;
            note: string | null;
          };
          return logDutyEvent({
            clientId: p.clientId,
            eventType: p.eventType,
            departureId,
            vehicleId,
            odometer: p.odometer,
            note: p.note,
            clientOccurredAt: new Date().toISOString(),
          });
        }
        case "collect_parcel": {
          const p = action.payload as { operationalStopParcelId: string; clientId: string };
          return collectParcel(p.operationalStopParcelId, p.clientId);
        }
        case "deliver_parcel": {
          const p = action.payload as { operationalStopParcelId: string; signatureName: string | null };
          return deliverParcel({ operationalStopParcelId: p.operationalStopParcelId, signatureName: p.signatureName });
        }
        case "fail_parcel": {
          const p = action.payload as { operationalStopParcelId: string; reason: string };
          return reportParcelFailed(p.operationalStopParcelId, p.reason);
        }
        default:
          return { error: "Unknown action type" };
      }
    });
  }, [departureId, vehicleId]);

  async function refreshManifest() {
    const { manifest: fresh } = await getMyStopManifest(departureId);
    if (fresh) setManifest(fresh);
  }

  const currentStop = useMemo(
    () => manifest.stops.find((s) => s.status === "pending" || s.status === "arrived") ?? null,
    [manifest]
  );
  const upcomingStops = useMemo(
    () =>
      manifest.stops.filter(
        (s) => s.stop_id !== currentStop?.stop_id && s.status !== "completed" && s.status !== "skipped"
      ),
    [manifest, currentStop]
  );

  function navigateTo(line1: string, postcode: string, lat: number | null, lng: number | null) {
    const destination = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(`${line1}, ${postcode}`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, "_blank");
  }

  function handleArrive(stopId: string) {
    enqueueAction("arrive_stop", { stopId, clientId: crypto.randomUUID() });
    setManifest((m) => ({
      stops: m.stops.map((s) => (s.stop_id === stopId ? { ...s, status: "arrived" } : s)),
    }));
    setTimeout(refreshManifest, 800);
  }

  function handleCollected(stopId: string) {
    enqueueAction("depart_stop", { stopId });
    setManifest((m) => ({
      stops: m.stops.map((s) => (s.stop_id === stopId ? { ...s, status: "completed" } : s)),
    }));
    setTimeout(refreshManifest, 800);
  }

  function handleProblemSubmit(stopId: string) {
    if (!problemNote.trim()) return;
    enqueueAction("problem_stop", { stopId, note: problemNote });
    setShowProblemFor(null);
    setProblemNote("");
    setManifest((m) => ({
      stops: m.stops.map((s) => (s.stop_id === stopId ? { ...s, status: "problem" } : s)),
    }));
  }

  function handleBoard(operationalStopPassengerId: string, boarded: boolean) {
    enqueueAction("board_passenger", { operationalStopPassengerId, boarded, noShow: !boarded });
    setManifest((m) => ({
      stops: m.stops.map((s) => ({
        ...s,
        passengers: s.passengers.map((p) =>
          p.operational_stop_passenger_id === operationalStopPassengerId ? { ...p, boarded, no_show: !boarded } : p
        ),
      })),
    }));
  }

  function handleDutyEvent(eventType: DutyEventType) {
    enqueueAction("duty_event", { clientId: crypto.randomUUID(), eventType, odometer: null, note: null });
  }

  function handleCollectParcel(operationalStopParcelId: string) {
    enqueueAction("collect_parcel", { operationalStopParcelId, clientId: crypto.randomUUID() });
    setManifest((m) => ({
      stops: m.stops.map((s) => ({
        ...s,
        parcels: s.parcels.map((p) =>
          p.operational_stop_parcel_id === operationalStopParcelId ? { ...p, status: "onboard" } : p
        ),
      })),
    }));
  }

  function handleDeliverParcel(operationalStopParcelId: string) {
    enqueueAction("deliver_parcel", { operationalStopParcelId, signatureName: null });
    setManifest((m) => ({
      stops: m.stops.map((s) => ({
        ...s,
        parcels: s.parcels.map((p) =>
          p.operational_stop_parcel_id === operationalStopParcelId ? { ...p, status: "delivered" } : p
        ),
      })),
    }));
  }

  function handleFailParcel(operationalStopParcelId: string, role: "collection" | "delivery") {
    enqueueAction("fail_parcel", { operationalStopParcelId, reason: "Reported by driver" });
    const failedStatus = role === "collection" ? "failed_collection" : "failed_delivery";
    setManifest((m) => ({
      stops: m.stops.map((s) => ({
        ...s,
        parcels: s.parcels.map((p) =>
          p.operational_stop_parcel_id === operationalStopParcelId ? { ...p, status: failedStatus } : p
        ),
      })),
    }));
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Duty state bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-b bg-white p-3">
        {DUTY_EVENTS.map((e) => (
          <button
            key={e.type}
            onClick={() => handleDutyEvent(e.type)}
            className="shrink-0 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-100"
          >
            {e.label}
          </button>
        ))}
        <Link
          href="/driver/check"
          className="shrink-0 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 active:bg-slate-100"
        >
          Vehicle check
        </Link>
      </div>

      {crossingReference && (
        <div className="bg-brand-dark p-3 text-center text-white">
          <p className="text-sm font-medium">
            Crossing check-in:{" "}
            {crossingCheckinDeadline
              ? new Date(crossingCheckinDeadline).toLocaleTimeString("en-GB", { timeStyle: "short" })
              : "—"}
          </p>
          <p className="text-xs opacity-90">Ref {crossingReference}</p>
        </div>
      )}

      <div className="flex-1 p-4">
        {!currentStop ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-600">
            No more stops on your segment. Check with the office if you expected more.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {currentStop.status === "arrived" ? "At stop" : "Next stop"}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {currentStop.address.fixed_point_name ?? currentStop.address.line1}
            </h2>
            {currentStop.address.fixed_point_name && (
              <p className="text-slate-600">{currentStop.address.line1}</p>
            )}
            {currentStop.address.access_notes && (
              <p className="mt-1 text-sm text-amber-700">{currentStop.address.access_notes}</p>
            )}

            {currentStop.passengers.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  {currentStop.stop_type === "dropoff" ? "Drop off" : "Collect"}
                </p>
                <ul className="space-y-2">
                  {currentStop.passengers.map((p) => (
                    <li
                      key={p.operational_stop_passenger_id}
                      className="flex items-center justify-between rounded border border-slate-200 p-2"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {p.full_name} {p.wheelchair_space && "· wheelchair"}
                        </p>
                        <p className="text-sm text-slate-500">
                          {p.category} · {p.luggage_large + p.luggage_small} suitcases
                          {p.luggage_oversize > 0 && ` · ${p.luggage_oversize} oversize`}
                          {p.phone && ` · ${p.phone}`}
                        </p>
                        {p.mobility_needs && <p className="text-sm text-amber-700">{p.mobility_needs}</p>}
                      </div>
                      <button
                        onClick={() => handleBoard(p.operational_stop_passenger_id, !p.boarded)}
                        className={`shrink-0 rounded px-3 py-2 text-sm font-medium ${
                          p.boarded ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {p.boarded ? "✓ Boarded" : "Mark boarded"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {currentStop.parcels.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">Parcels</p>
                <ul className="space-y-2">
                  {currentStop.parcels.map((p) => {
                    const done = p.status === "delivered" || p.status === "onboard" || p.status.startsWith("failed");
                    return (
                      <li
                        key={p.operational_stop_parcel_id}
                        className="rounded border border-slate-200 p-2"
                      >
                        <p className="font-medium text-slate-900">
                          {p.reference} — {p.contact_name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {p.size_category} · qty {p.quantity} {p.contact_phone && `· ${p.contact_phone}`}
                        </p>
                        {p.special_instructions && (
                          <p className="text-sm text-amber-700">{p.special_instructions}</p>
                        )}
                        {!done && (
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() =>
                                p.role === "collection"
                                  ? handleCollectParcel(p.operational_stop_parcel_id)
                                  : handleDeliverParcel(p.operational_stop_parcel_id)
                              }
                              className="flex-1 rounded bg-green-600 py-2 text-sm font-medium text-white"
                            >
                              {p.role === "collection" ? "Collected" : "Delivered"}
                            </button>
                            <button
                              onClick={() => handleFailParcel(p.operational_stop_parcel_id, p.role)}
                              className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
                            >
                              Problem
                            </button>
                          </div>
                        )}
                        {done && <p className="mt-1 text-sm text-green-700">{p.status}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  navigateTo(
                    currentStop.address.line1,
                    currentStop.address.postcode,
                    currentStop.address.latitude,
                    currentStop.address.longitude
                  )
                }
                className="col-span-2 rounded-lg border border-slate-300 py-3 text-base font-semibold text-slate-700 active:bg-slate-100"
              >
                Navigate
              </button>
              {currentStop.status !== "arrived" ? (
                <button
                  onClick={() => handleArrive(currentStop.stop_id)}
                  className="col-span-2 rounded-lg bg-brand-dark py-4 text-lg font-bold text-white active:opacity-90"
                >
                  Arrived
                </button>
              ) : (
                <button
                  onClick={() => handleCollected(currentStop.stop_id)}
                  className="col-span-2 rounded-lg bg-brand-dark py-4 text-lg font-bold text-white active:opacity-90"
                >
                  {currentStop.stop_type === "dropoff" ? "Delivered" : "Collected"}
                </button>
              )}
              <button
                onClick={() => setShowProblemFor(currentStop.stop_id)}
                className="col-span-2 rounded-lg border border-red-300 py-2 text-sm font-medium text-red-700 active:bg-red-50"
              >
                Problem
              </button>
            </div>

            {showProblemFor === currentStop.stop_id && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 p-3">
                <textarea
                  value={problemNote}
                  onChange={(e) => setProblemNote(e.target.value)}
                  placeholder="What's the problem?"
                  className="w-full rounded border border-slate-300 p-2 text-sm"
                  rows={2}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleProblemSubmit(currentStop.stop_id)}
                    className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Report
                  </button>
                  <button
                    onClick={() => setShowProblemFor(null)}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {upcomingStops.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-slate-500">Then</p>
            <ul className="space-y-1">
              {upcomingStops.map((s) => (
                <li key={s.stop_id} className="rounded border border-slate-200 bg-white p-2 text-sm text-slate-600">
                  {s.address.fixed_point_name ?? s.address.line1}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sync indicator — build spec §24: "Visible sync indicator." */}
      <div
        className={`p-2 text-center text-sm font-medium ${
          !online
            ? "bg-amber-100 text-amber-800"
            : pendingCount > 0
              ? "bg-slate-100 text-slate-600"
              : "bg-green-50 text-green-700"
        }`}
      >
        {!online
          ? `Offline${pendingCount > 0 ? ` · ${pendingCount} action${pendingCount === 1 ? "" : "s"} queued` : ""}`
          : pendingCount > 0
            ? `Syncing ${pendingCount} action${pendingCount === 1 ? "" : "s"}...`
            : hasErrors
              ? "Sync issue — will retry"
              : "✓ All synced"}
      </div>
    </div>
  );
}
