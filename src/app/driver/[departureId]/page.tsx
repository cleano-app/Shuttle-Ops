import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMyAssignments, getMyHandoverContext, getMyStopManifest } from "@/app/actions/driver";
import { DriverRouteScreen } from "@/components/driver/DriverRouteScreen";
import { AssignmentResponse } from "@/components/driver/AssignmentResponse";
import { HandoverPanel } from "@/components/driver/HandoverPanel";
import { formatUk } from "@/lib/time";
import { JourneyBadge } from "@/components/JourneyBadge";

export default async function DriverDeparturePage({
  params,
}: {
  params: Promise<{ departureId: string }>;
}) {
  const { departureId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "driver") redirect("/office/dashboard");

  const [{ assignments }, { manifest, error }, handover] = await Promise.all([
    getMyAssignments(),
    getMyStopManifest(departureId),
    getMyHandoverContext(departureId),
  ]);

  const assignment = assignments.find((a) => a.departure_id === departureId);
  if (!assignment || error || !manifest) notFound();

  // Default counts for a handover: who's aboard right now on this segment.
  // Picked up and not yet dropped off.
  const aboardPassengers = Math.max(
    0,
    manifest.stops
      .flatMap((s) => s.passengers)
      .filter((p) => p.boarded)
      .reduce((n, p) => n + (p.role === "pickup" ? 1 : -1), 0)
  );
  const aboardParcels = manifest.stops.reduce(
    (n, s) => n + s.parcels.filter((p) => p.role === "collection" && p.status === "onboard").length,
    0
  );

  return (
    <DriverRouteScreen
      departureId={departureId}
      vehicleId={assignment.vehicle_id}
      initialManifest={manifest}
      crossingReference={assignment.crossing_reference}
      crossingCheckinDeadline={assignment.crossing_checkin_deadline}
      banner={
        <>
          <div className="mb-3">
            <p className="text-base font-semibold text-slate-900">
              <JourneyBadge routeName={assignment.route_name} direction={assignment.direction} />
            </p>
            <p className="text-sm text-muted">
              {formatUk(assignment.depart_at, { date: "medium", time: "short" })} · Vehicle{" "}
              {assignment.vehicle_registration}
            </p>
          </div>
          {assignment.assignment_status === "assigned" && <AssignmentResponse assignmentId={assignment.assignment_id} />}
        </>
      }
      footer={
        <>
          <HandoverPanel
            departureId={departureId}
            vehicleId={assignment.vehicle_id}
            crew={handover.crew}
            handovers={handover.handovers}
            loadError={handover.error}
            stops={manifest.stops.map((s) => ({
              stop_id: s.stop_id,
              label: s.address.fixed_point_name ?? s.address.line1,
            }))}
            defaultPassengerCount={aboardPassengers}
            defaultParcelCount={aboardParcels}
          />
          <a
            href={`/api/pdf/manifest/${departureId}`}
            className="mt-4 block rounded-lg border border-slate-300 bg-white py-3 text-center text-base font-medium text-slate-800 active:bg-press"
          >
            Download paper manifest (PDF)
          </a>
          <p className="mt-1 text-center text-xs text-muted">Save it while you have signal, in case the app can&apos;t load.</p>
        </>
      }
    />
  );
}
