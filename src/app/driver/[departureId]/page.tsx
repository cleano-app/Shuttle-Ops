import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMyAssignments, getMyStopManifest } from "@/app/actions/driver";
import { DriverRouteScreen } from "@/components/driver/DriverRouteScreen";

export default async function DriverDeparturePage({
  params,
}: {
  params: Promise<{ departureId: string }>;
}) {
  const { departureId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "driver") redirect("/office/dashboard");

  const [{ assignments }, { manifest, error }] = await Promise.all([
    getMyAssignments(),
    getMyStopManifest(departureId),
  ]);

  const assignment = assignments.find((a) => a.departure_id === departureId);
  if (!assignment || error || !manifest) notFound();

  return (
    <DriverRouteScreen
      departureId={departureId}
      vehicleId={assignment.vehicle_id}
      initialManifest={manifest}
      crossingReference={assignment.crossing_reference}
      crossingCheckinDeadline={assignment.crossing_checkin_deadline}
    />
  );
}
