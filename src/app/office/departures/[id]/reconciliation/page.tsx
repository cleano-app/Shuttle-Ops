import { notFound } from "next/navigation";
import Link from "next/link";
import { getDepartureReconciliation } from "@/app/actions/reconciliation";

export default async function DepartureReconciliationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getDepartureReconciliation(id);
  if ("error" in result) notFound();

  const { departure, passengers, load, crossing, drivers, income, costs, cash } = result;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/office/departures/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Departure
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          {departure.routeName} · {departure.direction} — Reconciliation
        </h1>
        <p className="text-sm text-slate-500">
          {new Date(departure.departAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Passengers</h2>
        <p className="text-sm text-slate-700">
          Capacity {passengers.capacity} · Released {passengers.released} · Confirmed {passengers.confirmed} ·
          Travelled {passengers.travelled} · No-show {passengers.noShow}
        </p>
        <p className="text-sm text-slate-500">
          {passengers.composition.men} men · {passengers.composition.women} women · {passengers.composition.boys}{" "}
          boys · {passengers.composition.girls} girls · {passengers.composition.infants} infants
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Load</h2>
        <p className="text-sm text-slate-700">
          Hold used {load.holdUsed} / {load.holdCapacity} — {load.luggageUnits} luggage units, {load.parcelUnits}{" "}
          parcel units ({load.parcelCount} parcels)
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Crossing</h2>
        <p className="text-sm text-slate-700">
          Limit {crossing.limit ?? "—"} · Booked {crossing.booked} · Check-in{" "}
          {crossing.checkinDeadline ? new Date(crossing.checkinDeadline).toLocaleTimeString("en-GB", { timeStyle: "short" }) : "—"} · Ref{" "}
          {crossing.reference ?? "—"}
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Drivers</h2>
        <ul className="text-sm text-slate-700">
          {drivers.map((d, i) => (
            <li key={i}>
              {d.driverName} — {d.vehicleRegistration} ({d.status})
            </li>
          ))}
          {drivers.length === 0 && <li className="text-slate-500">No drivers assigned.</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Income</h2>
        <p className="text-sm text-slate-700">
          GBP — Contributions £{income.gbp.contributions} · Sponsorship £{income.gbp.sponsorship} · Luggage £
          {income.gbp.luggageCharges} · Parcels £{income.gbp.parcels}
        </p>
        <p className="text-sm text-slate-700">
          EUR — Contributions €{income.eur.contributions} · Sponsorship €{income.eur.sponsorship} · Luggage €
          {income.eur.luggageCharges} · Parcels €{income.eur.parcels}
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Costs</h2>
        <p className="text-sm text-slate-700">
          Driver expenses — £{costs.gbp.driverExpenses} / €{costs.eur.driverExpenses}
        </p>
        <p className="text-xs text-slate-500">
          Driver pay itself is tracked per pay period (Driver Pay page), not per departure.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Cash</h2>
        <p className="text-sm text-slate-700">
          GBP — Float £{cash.gbp.float} · Collected £{cash.gbp.collected} · Handed in £{cash.gbp.handedIn}{" "}
          {cash.gbp.unreconciled ? "· unreconciled" : "· ✓ reconciled"}
        </p>
        <p className="text-sm text-slate-700">
          EUR — Float €{cash.eur.float} · Collected €{cash.eur.collected} · Handed in €{cash.eur.handedIn}{" "}
          {cash.eur.unreconciled ? "· unreconciled" : "· ✓ reconciled"}
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-900">Result</h2>
        <p className="text-sm text-slate-700">
          Notional value delivered £{income.gbp.notionalValue} / €{income.eur.notionalValue}
        </p>
        <p className="text-sm text-slate-700">
          Net charitable cost (subsidy) £{income.gbp.subsidy} / €{income.eur.subsidy}
        </p>
      </section>
    </div>
  );
}
