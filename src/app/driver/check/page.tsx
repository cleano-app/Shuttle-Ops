import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMyAssignments } from "@/app/actions/driver";
import { VehicleCheckForm } from "@/components/driver/VehicleCheckForm";

export default async function DriverVehicleCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "driver") redirect("/office/dashboard");

  const { assignments } = await getMyAssignments();
  if (assignments.length === 0) {
    return (
      <div className="p-6 text-center text-slate-600">
        No current assignment — nothing to check right now.
      </div>
    );
  }

  // Reuses vehicle_registration already resolved by the
  // get_driver_assignments() security-definer function, rather than
  // querying `vehicles` directly here — that table is dispatcher-only RLS
  // (0007_vehicles.sql), so a driver's own direct select on it returns
  // zero rows (confirmed live: this page showed the "Vehicle" fallback
  // instead of the real registration before this fix).
  const assignment = assignments[0];

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <VehicleCheckForm
        vehicleId={assignment.vehicle_id}
        vehicleRegistration={assignment.vehicle_registration}
        departureId={assignment.departure_id}
        checkType={type === "post_trip" ? "post_trip" : "pre_trip"}
      />
    </div>
  );
}
