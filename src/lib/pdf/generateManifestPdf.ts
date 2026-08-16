import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { ManifestDocument, type ManifestData, type ManifestStop } from "./ManifestDocument";

export class ManifestNotFoundError extends Error {}

export async function generateManifestPdf(
  supabase: SupabaseClient<Database>,
  departureId: string
): Promise<Buffer> {
  const { data: departure } = await supabase
    .from("departures")
    .select("direction, depart_at, crossing_reference, crossing_checkin_deadline, routes(name)")
    .eq("id", departureId)
    .single();
  if (!departure) throw new ManifestNotFoundError("Departure not found");

  const routeName = (departure as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";

  const [{ data: stops }, { data: assignments }] = await Promise.all([
    supabase
      .from("operational_stops")
      .select("id, planned_sequence, planned_arrival_at, addresses(line1, postcode, fixed_point_name)")
      .eq("departure_id", departureId)
      .order("planned_sequence", { ascending: true }),
    supabase
      .from("driver_assignments")
      .select("from_stop_sequence, to_stop_sequence, profiles!driver_assignments_driver_id_fkey(display_name), vehicles(registration)")
      .eq("departure_id", departureId),
  ]);

  const stopIds = (stops ?? []).map((s) => s.id);
  const { data: stopPassengers } = stopIds.length
    ? await supabase
        .from("operational_stop_passengers")
        .select(
          "operational_stop_id, role, booking_passengers(category, luggage_large, luggage_small, luggage_oversize, passengers(full_name, phone))"
        )
        .in("operational_stop_id", stopIds)
    : { data: [] };

  const manifestStops: ManifestStop[] = (stops ?? []).map((s) => {
    const address = (s as unknown as { addresses?: { line1?: string; postcode?: string; fixed_point_name?: string } })
      .addresses;
    const passengers = (stopPassengers ?? [])
      .filter((sp) => sp.operational_stop_id === s.id)
      .map((sp) => {
        const bp = (
          sp as unknown as {
            booking_passengers?: {
              category: string;
              luggage_large: number;
              luggage_small: number;
              luggage_oversize: number;
              passengers?: { full_name?: string; phone?: string | null };
            };
          }
        ).booking_passengers;
        return {
          full_name: bp?.passengers?.full_name ?? "Passenger",
          phone: bp?.passengers?.phone ?? null,
          category: bp?.category ?? "",
          luggage_large: bp?.luggage_large ?? 0,
          luggage_small: bp?.luggage_small ?? 0,
          luggage_oversize: bp?.luggage_oversize ?? 0,
          role: sp.role,
        };
      });
    return {
      sequence: s.planned_sequence,
      address_label: address?.fixed_point_name
        ? `${address.fixed_point_name} — ${address.line1}, ${address.postcode}`
        : `${address?.line1 ?? ""}, ${address?.postcode ?? ""}`,
      planned_arrival_at: s.planned_arrival_at,
      passengers,
    };
  });

  const driverSegments = (assignments ?? []).map((a) => ({
    driver_name:
      (a as unknown as { profiles?: { display_name?: string } }).profiles?.display_name ?? "Driver",
    vehicle_registration:
      (a as unknown as { vehicles?: { registration?: string } }).vehicles?.registration ?? "Vehicle",
    from_stop_sequence: a.from_stop_sequence,
    to_stop_sequence: a.to_stop_sequence,
  }));

  const vehicleRegistrations = Array.from(new Set(driverSegments.map((s) => s.vehicle_registration)));

  const data: ManifestData = {
    routeName,
    direction: departure.direction,
    departAt: departure.depart_at,
    crossingReference: departure.crossing_reference,
    crossingCheckinDeadline: departure.crossing_checkin_deadline,
    vehicleRegistrations,
    driverSegments,
    stops: manifestStops,
    generatedAt: new Date().toISOString(),
  };

  return renderToBuffer(ManifestDocument({ data }));
}
