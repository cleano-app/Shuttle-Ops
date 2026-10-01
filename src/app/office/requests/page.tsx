import Link from "next/link";
import { Journey, journeyStartColor } from "@/components/Journey";
import { ActionForm } from "@/components/forms/ActionForm";
import { declineBookingRequest, listBookingRequests, type RequestDeparture } from "@/app/actions/bookingRequests";
import { luggageText, partyText, LANGUAGES } from "@/components/book/request";
import { formatUk } from "@/lib/time";
import type { BookingRequestRow } from "@/types/database";
import { ConvertRequest } from "./ConvertRequest";

export const metadata = { title: "Booking requests" };

const STATUS_STYLE: Record<string, string> = {
  converted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  waitlisted: "bg-amber-50 text-amber-800 ring-amber-200",
  declined: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
};

function Leg({ label, dep }: { label: string; dep: RequestDeparture | undefined }) {
  if (!dep) return <p className="text-sm text-red-700">{label}: departure not found</p>;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-700">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <Journey routeName={dep.route_name} direction={dep.direction} size="sm" />
      <Link href={`/office/departures/${dep.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">
        {formatUk(dep.depart_at, { date: "full", time: "short" })}
      </Link>
      {dep.status !== "published" && <span className="text-xs text-amber-700">({dep.status})</span>}
    </p>
  );
}

function address(line1: string, city: string | null, postcode: string) {
  return [line1, city, postcode].filter(Boolean).join(", ");
}

export default async function BookingRequestsPage() {
  const { error, pending, handled, departures } = await listBookingRequests();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Booking requests</h1>
        <p className="text-sm text-slate-500">
          Sent from the public <Link href="/book" className="underline">/book</Link> page. Call the customer, then
          create the booking — it&apos;s made provisional at the full fare with the deposit required, ready for you to
          adjust and take the deposit as usual.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-900">Waiting ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No requests waiting.</p>
        ) : (
          pending.map((r) => <PendingCard key={r.id} r={r} departures={departures} />)
        )}
      </section>

      {handled.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-900">Handled in the last two weeks</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {handled.map((r) => {
              const dep = departures.get(r.outbound_departure_id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
                  <span className="font-mono text-slate-500">{r.reference}</span>
                  <span className="font-medium text-slate-900">{r.contact_name}</span>
                  {dep && <Journey routeName={dep.route_name} direction={dep.direction} size="sm" />}
                  {dep && <span className="text-slate-600">{formatUk(dep.depart_at, { date: "medium", time: "short" })}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLE[r.status] ?? ""}`}>
                    {r.status}
                  </span>
                  {r.converted_booking_reference && <span className="text-slate-700">→ {r.converted_booking_reference}</span>}
                  {r.decline_reason && <span className="text-slate-500">“{r.decline_reason}”</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function PendingCard({ r, departures }: { r: BookingRequestRow; departures: Map<string, RequestDeparture> }) {
  const out = departures.get(r.outbound_departure_id);
  const ret = r.return_departure_id ? departures.get(r.return_departure_id) : undefined;
  const party = { men: r.men, women: r.women, boys: r.boys, girls: r.girls, infants: r.infants };
  const lang = LANGUAGES.find((l) => l.value === r.preferred_language)?.label;

  return (
    <article
      className="space-y-3 rounded-xl border border-s-4 border-slate-200 bg-white p-4"
      style={{ borderInlineStartColor: out ? journeyStartColor(out.route_name, out.direction) : undefined }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold text-slate-900">
          {r.contact_name}{" "}
          <a href={`tel:${r.contact_phone.replace(/[^\d+]/g, "")}`} className="ms-1 text-base font-medium text-sky-700 underline">
            {r.contact_phone}
          </a>
        </p>
        <p className="text-xs text-slate-500">
          <span className="font-mono">{r.reference}</span> · sent {formatUk(r.created_at, { date: "medium", time: "short" })}
        </p>
      </div>

      <div className="space-y-1">
        <Leg label="Going" dep={out} />
        {r.return_departure_id && <Leg label="Return" dep={ret} />}
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline text-slate-500">Party: </dt>
          <dd className="inline font-medium text-slate-900">{partyText(party)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Luggage: </dt>
          <dd className="inline text-slate-900">{luggageText({ large: r.luggage_large, small: r.luggage_small, hand: r.luggage_hand })}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Pick-up: </dt>
          <dd className="inline text-slate-900">{address(r.pickup_line1, r.pickup_city, r.pickup_postcode)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Drop-off: </dt>
          <dd className="inline text-slate-900">{address(r.dropoff_line1, r.dropoff_city, r.dropoff_postcode)}</dd>
        </div>
        {r.contact_email && (
          <div>
            <dt className="inline text-slate-500">Email: </dt>
            <dd className="inline">
              <a href={`mailto:${r.contact_email}`} className="text-sky-700 underline">
                {r.contact_email}
              </a>
            </dd>
          </div>
        )}
        {lang && (
          <div>
            <dt className="inline text-slate-500">Language: </dt>
            <dd className="inline text-slate-900">{lang}</dd>
          </div>
        )}
      </dl>
      {r.mobility_needs && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Mobility: </span>
          {r.mobility_needs}
        </p>
      )}
      {r.notes && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="font-semibold">Notes: </span>
          {r.notes}
        </p>
      )}
      {r.lead_passenger_id && (
        <p className="text-xs text-slate-500">
          Passengers already created from an earlier attempt —{" "}
          <Link href={`/office/passengers/${r.lead_passenger_id}`} className="underline">
            lead passenger
          </Link>
          .
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 border-t border-slate-100 pt-3">
        <ConvertRequest id={r.id} />
        <ActionForm action={declineBookingRequest} className="flex flex-wrap items-center gap-2" confirm="Decline this request?">
          <input type="hidden" name="id" value={r.id} />
          <input
            name="reason"
            required
            maxLength={500}
            placeholder="Reason for declining"
            className="min-w-[200px] rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">
            Decline
          </button>
        </ActionForm>
      </div>
    </article>
  );
}
