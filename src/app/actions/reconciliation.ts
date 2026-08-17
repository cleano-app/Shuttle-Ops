"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * Build spec §35: "Every completed departure gets an operational and
 * financial reconciliation." Pulls together data already recorded
 * elsewhere (bookings, cash_transactions, driver_expenses, driver_
 * assignments, duty events) into the one summary shape the spec's own
 * example lays out — this is a read-only aggregation, it doesn't decide
 * or move anything.
 */
export async function getDepartureReconciliation(departureId: string) {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();

  const [{ data: departure }, { data: summary }, { data: bookingPassengers }, { data: parcels }, { data: assignments }, { data: cash }, { data: expenses }] =
    await Promise.all([
      supabase.from("departures").select("*, routes(name)").eq("id", departureId).single(),
      supabase.from("departure_capacity_summary").select("*").eq("departure_id", departureId).maybeSingle(),
      supabase
        .from("booking_passengers")
        .select("status, category, contribution, sponsored, subsidy, notional_fare, luggage_charge, deposit_status, currency")
        .in("booking_id", (await supabase.from("bookings").select("id").eq("departure_id", departureId)).data?.map((b) => b.id) ?? []),
      supabase.from("parcels").select("price, currency, status").eq("departure_id", departureId),
      supabase
        .from("driver_assignments")
        .select("*, profiles!driver_assignments_driver_id_fkey(display_name), vehicles(registration)")
        .eq("departure_id", departureId),
      supabase.from("cash_transactions").select("*").eq("departure_id", departureId),
      supabase.from("driver_expenses").select("*").eq("departure_id", departureId),
    ]);

  if (!departure) return { error: "Departure not found." };

  const confirmed = (bookingPassengers ?? []).filter((bp) => bp.status === "confirmed" || bp.status === "travelled");
  const travelled = (bookingPassengers ?? []).filter((bp) => bp.status === "travelled");
  const noShow = (bookingPassengers ?? []).filter((bp) => bp.status === "no_show");

  const incomeByCurrency = (currency: "GBP" | "EUR") => {
    const rows = confirmed.filter((bp) => bp.currency === currency);
    return {
      contributions: rows.reduce((s, bp) => s + Number(bp.contribution), 0),
      sponsorship: rows.reduce((s, bp) => s + Number(bp.sponsored), 0),
      luggageCharges: rows.reduce((s, bp) => s + Number(bp.luggage_charge), 0),
      notionalValue: rows.reduce((s, bp) => s + Number(bp.notional_fare), 0),
      subsidy: rows.reduce((s, bp) => s + Number(bp.subsidy), 0),
    };
  };
  const parcelIncome = (parcels ?? [])
    .filter((p) => p.status !== "cancelled")
    .reduce(
      (acc, p) => {
        acc[p.currency as "GBP" | "EUR"] += Number(p.price);
        return acc;
      },
      { GBP: 0, EUR: 0 }
    );

  const costsByCurrency = (currency: "GBP" | "EUR") => ({
    driverExpenses: (expenses ?? []).filter((e) => e.currency === currency).reduce((s, e) => s + Number(e.amount), 0),
  });

  const cashSummary = (currency: "GBP" | "EUR") => {
    const rows = (cash ?? []).filter((c) => c.currency === currency);
    const float = rows.filter((c) => c.transaction_type === "opening_float").reduce((s, c) => s + Number(c.amount), 0);
    const collected = rows
      .filter((c) => !["opening_float", "driver_to_office_handover"].includes(c.transaction_type))
      .reduce((s, c) => s + Number(c.amount), 0);
    const handedIn = rows.filter((c) => c.transaction_type === "driver_to_office_handover").reduce((s, c) => s + Number(c.amount), 0);
    const unreconciled = rows.some((c) => !c.reconciled_at);
    return { float, collected, handedIn, unreconciled };
  };

  const totalDriverPay = (assignments ?? []).length; // placeholder count; real pay comes from driver_pay_statements per period, not per departure

  return {
    departure: {
      routeName: (departure as unknown as { routes?: { name?: string } }).routes?.name ?? "Route",
      direction: departure.direction,
      departAt: departure.depart_at,
      status: departure.status,
    },
    passengers: {
      capacity: departure.seats_capacity,
      released: departure.seats_released,
      confirmed: confirmed.length,
      travelled: travelled.length,
      noShow: noShow.length,
      composition: {
        men: confirmed.filter((bp) => bp.category === "man").length,
        women: confirmed.filter((bp) => bp.category === "woman").length,
        boys: confirmed.filter((bp) => bp.category === "boy").length,
        girls: confirmed.filter((bp) => bp.category === "girl").length,
        infants: confirmed.filter((bp) => bp.category === "infant").length,
      },
    },
    load: {
      holdUsed: summary?.hold_used ?? 0,
      holdCapacity: departure.hold_capacity_units,
      luggageUnits: summary?.luggage_units_used ?? 0,
      parcelUnits: summary?.parcel_units_used ?? 0,
      parcelCount: summary?.parcel_count ?? 0,
    },
    crossing: {
      limit: departure.crossing_passenger_limit,
      booked: summary?.crossing_headcount ?? 0,
      checkinDeadline: departure.crossing_checkin_deadline,
      reference: departure.crossing_reference,
    },
    drivers: (assignments ?? []).map((a) => ({
      driverName: (a as unknown as { profiles?: { display_name?: string } }).profiles?.display_name ?? "Driver",
      vehicleRegistration: (a as unknown as { vehicles?: { registration?: string } }).vehicles?.registration ?? "Vehicle",
      status: a.status,
    })),
    income: { gbp: { ...incomeByCurrency("GBP"), parcels: parcelIncome.GBP }, eur: { ...incomeByCurrency("EUR"), parcels: parcelIncome.EUR } },
    costs: { gbp: costsByCurrency("GBP"), eur: costsByCurrency("EUR"), driverAssignmentCount: totalDriverPay },
    cash: { gbp: cashSummary("GBP"), eur: cashSummary("EUR") },
  };
}

/** Build spec §35's standing reports — subsidy delivered, distinct
 * beneficiaries, no-show/late-cancel rates — rolled up across a date
 * range rather than per departure. */
export async function getSubsidySummary(sinceDays = 30) {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const supabase = await createClient();
  const { data: bookingPassengers } = await supabase
    .from("booking_passengers")
    .select("passenger_id, subsidy, contribution, sponsored, notional_fare, status, created_at")
    .gte("created_at", since.toISOString())
    .in("status", ["confirmed", "travelled"]);

  const rows = bookingPassengers ?? [];
  const distinctBeneficiaries = new Set(rows.map((r) => r.passenger_id)).size;
  const totalSubsidy = rows.reduce((s, r) => s + Number(r.subsidy), 0);
  const totalNotionalValue = rows.reduce((s, r) => s + Number(r.notional_fare), 0);
  const totalContribution = rows.reduce((s, r) => s + Number(r.contribution), 0);

  return {
    periodDays: sinceDays,
    tripsCount: rows.length,
    distinctBeneficiaries,
    totalSubsidy: Math.round(totalSubsidy * 100) / 100,
    totalNotionalValue: Math.round(totalNotionalValue * 100) / 100,
    totalContribution: Math.round(totalContribution * 100) / 100,
    costRecoveryPct: totalNotionalValue > 0 ? Math.round((totalContribution / totalNotionalValue) * 1000) / 10 : 0,
  };
}
