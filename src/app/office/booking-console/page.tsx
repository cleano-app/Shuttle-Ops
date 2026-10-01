import { createClient } from "@/lib/supabase/server";
import { expireStaleProvisionalBookings } from "@/app/actions/bookings";
import { BookingConsole } from "@/components/office/BookingConsole";
import type { DepartureOption } from "@/components/office/DepartureInfoPanel";
import type { AreaOption } from "@/components/office/AddressAutocomplete";
import type { DepositDefaults } from "@/components/office/types";

export default async function BookingConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ departure?: string }>;
}) {
  const { departure: initialDepartureId } = await searchParams;
  // Lazy expiry sweep — same pattern as Cleano Ops's booking-request
  // expiry: computed at read-time, not a cron job (build spec §6/§10).
  await expireStaleProvisionalBookings();

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // Only departures Office can actually sell: published and not yet gone.
  // Drafts aren't on sale and boarding/departed ones are too late to book.
  const [{ data, error }, { data: areaRows, error: areaError }, { data: settings }] = await Promise.all([
    supabase
      .from("departures")
      .select("id, direction, depart_at, status, seats_capacity, seats_released, route_id, routes(name)")
      .eq("status", "published")
      .gte("depart_at", nowIso)
      .order("depart_at", { ascending: true }),
    supabase
      .from("areas")
      .select("id, name, country, running_order")
      .eq("active", true)
      .order("running_order", { ascending: true }),
    // select("*") on purpose: default_deposit_gbp/eur arrive with
    // migration 0056 — reading them defensively means this page keeps
    // working whether or not that migration has been applied yet.
    supabase.from("app_settings").select("*").maybeSingle(),
  ]);

  const ids = (data ?? []).map((d) => d.id);
  const seatsUsedById = new Map<string, number>();
  if (ids.length > 0) {
    const { data: summaries } = await supabase
      .from("departure_capacity_summary")
      .select("departure_id, seats_used")
      .in("departure_id", ids);
    for (const s of summaries ?? []) {
      seatsUsedById.set(s.departure_id as string, Number(s.seats_used ?? 0));
    }
  }

  const departures: DepartureOption[] = (data ?? []).map((d) => ({
    id: d.id,
    direction: d.direction,
    depart_at: d.depart_at,
    status: d.status,
    seats_capacity: d.seats_capacity,
    seats_released: d.seats_released,
    route_id: d.route_id,
    routeName: (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route",
    seatsLeft: seatsUsedById.has(d.id)
      ? Math.max(0, d.seats_released - (seatsUsedById.get(d.id) ?? 0))
      : d.seats_released,
  }));

  const areas: AreaOption[] = (areaRows ?? []).map((a) => ({ id: a.id, name: a.name, country: a.country }));

  const s = (settings ?? null) as Record<string, unknown> | null;
  const gbp = s?.default_deposit_gbp;
  const eur = s?.default_deposit_eur;
  const depositDefaults: DepositDefaults = {
    GBP: gbp == null ? null : Number(gbp),
    EUR: eur == null ? null : Number(eur),
  };

  const loadError = error?.message ?? areaError?.message ?? null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Booking Console</h1>
      {loadError && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          Could not load everything for the console: {loadError}
        </p>
      )}
      <BookingConsole
        initialDepartures={departures}
        areas={areas}
        depositDefaults={depositDefaults}
        initialDepartureId={initialDepartureId ?? null}
      />
    </div>
  );
}
