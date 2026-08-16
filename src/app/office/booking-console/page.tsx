import { createClient } from "@/lib/supabase/server";
import { expireStaleProvisionalBookings } from "@/app/actions/bookings";
import { BookingConsole } from "@/components/office/BookingConsole";
import type { DepartureOption } from "@/components/office/DepartureInfoPanel";

export default async function BookingConsolePage() {
  // Lazy expiry sweep — same pattern as Cleano Ops's booking-request
  // expiry: computed at read-time, not a cron job (build spec §6/§10).
  await expireStaleProvisionalBookings();

  const supabase = await createClient();
  const { data } = await supabase
    .from("departures")
    .select("id, direction, depart_at, status, seats_capacity, seats_released, route_id, routes(name)")
    .in("status", ["draft", "published", "boarding"])
    .order("depart_at", { ascending: true });

  const departures: DepartureOption[] = (data ?? []).map((d) => ({
    id: d.id,
    direction: d.direction,
    depart_at: d.depart_at,
    status: d.status,
    seats_capacity: d.seats_capacity,
    seats_released: d.seats_released,
    route_id: d.route_id,
    routeName: (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route",
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Booking Console</h1>
      <BookingConsole initialDepartures={departures} />
    </div>
  );
}
