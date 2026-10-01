"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createHandoverAction,
  confirmHandoverAction,
  type HandoverCrewMember,
  type HandoverSummary,
} from "@/app/actions/driver";
import { formatUk } from "@/lib/time";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

function offlineAware(message: string) {
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "No signal - a handover needs a connection. Try again when you're back online."
    : message;
}

/**
 * Build spec §23: driver handovers - "Both drivers confirm". The outgoing
 * driver records mileage, fuel, cash, counts and keys and signs (typed
 * name); the incoming driver sees it here and countersigns.
 */
export function HandoverPanel({
  departureId,
  vehicleId,
  crew,
  handovers,
  stops,
  defaultPassengerCount,
  defaultParcelCount,
  loadError,
}: {
  departureId: string;
  vehicleId: string;
  crew: HandoverCrewMember[];
  handovers: HandoverSummary[];
  stops: { stop_id: string; label: string }[];
  defaultPassengerCount: number;
  defaultParcelCount: number;
  loadError?: string;
}) {
  const others = crew.filter((c) => !c.is_me);
  const incoming = handovers.filter((h) => h.direction === "incoming" && !h.to_signed);
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-4 rounded-lg border border-hairline bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Handover</h2>
      {loadError && <p className="mt-1 text-sm text-red-700">Couldn&apos;t load handovers: {loadError}</p>}

      {incoming.map((h) => (
        <IncomingHandover key={h.handover_id} handover={h} />
      ))}

      {others.length === 0 ? (
        <p className="mt-1 text-sm text-muted">You&apos;re the only driver on this run - no handover needed.</p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 w-full rounded-lg border border-slate-300 py-3 text-base font-semibold text-slate-800 active:bg-press"
        >
          Hand over to another driver
        </button>
      ) : (
        <HandoverForm
          departureId={departureId}
          vehicleId={vehicleId}
          others={others}
          stops={stops}
          defaultPassengerCount={defaultPassengerCount}
          defaultParcelCount={defaultParcelCount}
          onDone={() => setOpen(false)}
        />
      )}

      {handovers.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {handovers.map((h) => (
            <li key={h.handover_id} className="rounded border border-hairline p-2">
              <p className="font-medium text-slate-900">
                {h.from_driver_name} → {h.to_driver_name} · {h.vehicle_registration}
              </p>
              <p className="text-muted">
                {formatUk(h.occurred_at, { time: "short" })}
                {h.stop_label ? ` · at ${h.stop_label}` : ""}
                {h.odometer != null ? ` · ${h.odometer} mi` : ""}
              </p>
              <p className={h.to_signed ? "text-green" : "text-amber-text"}>
                {h.to_signed ? "✓ Both drivers signed" : `Waiting for ${h.to_driver_name} to sign`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HandoverForm({
  departureId,
  vehicleId,
  others,
  stops,
  defaultPassengerCount,
  defaultParcelCount,
  onDone,
}: {
  departureId: string;
  vehicleId: string;
  others: HandoverCrewMember[];
  stops: { stop_id: string; label: string }[];
  defaultPassengerCount: number;
  defaultParcelCount: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function num(fd: FormData, name: string) {
    const v = String(fd.get(name) ?? "").trim();
    return v === "" ? null : Number(v);
  }

  function submit(fd: FormData) {
    const toDriverId = String(fd.get("to_driver_id") ?? "");
    const signature = String(fd.get("signature") ?? "").trim();
    if (!toDriverId) return setError("Choose who you're handing over to.");
    if (!signature) return setError("Type your full name to sign.");
    setError(null);
    startTransition(async () => {
      const res = await createHandoverAction({
        departureId,
        vehicleId,
        toDriverId,
        stopId: String(fd.get("stop_id") ?? "") || null,
        odometer: num(fd, "odometer"),
        fuelLevel: String(fd.get("fuel_level") ?? "") || null,
        cashFloatGbp: num(fd, "cash_gbp"),
        cashFloatEur: num(fd, "cash_eur"),
        passengerCountConfirmed: num(fd, "passengers"),
        parcelCountConfirmed: num(fd, "parcels"),
        keysTransferred: fd.get("keys") === "on",
        notes: String(fd.get("notes") ?? "").trim() || null,
        signature,
      });
      if (res.error) return setError(offlineAware(res.error));
      onDone();
      router.refresh();
    });
  }

  return (
    <form action={submit} className="mt-3 space-y-3">
      <div>
        <label className={labelCls} htmlFor="ho-to">
          Handing over to
        </label>
        <select id="ho-to" name="to_driver_id" className={field} defaultValue={others.length === 1 ? others[0].driver_id : ""}>
          {others.length > 1 && (
            <option value="" disabled>
              Choose a driver
            </option>
          )}
          {others.map((c) => (
            <option key={c.assignment_id} value={c.driver_id}>
              {c.display_name} ({c.vehicle_registration})
            </option>
          ))}
        </select>
      </div>
      {stops.length > 0 && (
        <div>
          <label className={labelCls} htmlFor="ho-stop">
            Where
          </label>
          <select id="ho-stop" name="stop_id" className={field} defaultValue="">
            <option value="">Not at a stop</option>
            {stops.map((s) => (
              <option key={s.stop_id} value={s.stop_id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="ho-odo">
            Odometer
          </label>
          <input id="ho-odo" name="odometer" type="number" inputMode="numeric" min={0} className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ho-fuel">
            Fuel
          </label>
          <select id="ho-fuel" name="fuel_level" className={field} defaultValue="">
            <option value="">—</option>
            <option value="full">Full</option>
            <option value="3/4">3/4</option>
            <option value="1/2">1/2</option>
            <option value="1/4">1/4</option>
            <option value="reserve">Reserve</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="ho-gbp">
            Cash £
          </label>
          <input id="ho-gbp" name="cash_gbp" type="number" inputMode="decimal" step="0.01" min={0} className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ho-eur">
            Cash €
          </label>
          <input id="ho-eur" name="cash_eur" type="number" inputMode="decimal" step="0.01" min={0} className={field} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ho-pax">
            Passengers aboard
          </label>
          <input
            id="ho-pax"
            name="passengers"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={defaultPassengerCount}
            className={field}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="ho-parcels">
            Parcels aboard
          </label>
          <input
            id="ho-parcels"
            name="parcels"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={defaultParcelCount}
            className={field}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-base text-slate-800">
        <input type="checkbox" name="keys" className="h-5 w-5" /> Keys handed over
      </label>
      <div>
        <label className={labelCls} htmlFor="ho-notes">
          Notes
        </label>
        <textarea id="ho-notes" name="notes" rows={2} className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="ho-sign">
          Sign - type your full name
        </label>
        <input id="ho-sign" name="signature" autoComplete="name" className={field} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-dark py-3 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving..." : "Sign & hand over"}
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 text-base text-slate-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function IncomingHandover({ handover: h }: { handover: HandoverSummary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    const signature = String(fd.get("signature") ?? "").trim();
    if (!signature) return setError("Type your full name to sign.");
    setError(null);
    startTransition(async () => {
      const res = await confirmHandoverAction(h.handover_id, signature);
      if (res.error) return setError(offlineAware(res.error));
      router.refresh();
    });
  }

  const facts = [
    h.odometer != null ? `Odometer ${h.odometer}` : null,
    h.fuel_level ? `Fuel ${h.fuel_level}` : null,
    h.cash_float_gbp != null ? `£${h.cash_float_gbp}` : null,
    h.cash_float_eur != null ? `€${h.cash_float_eur}` : null,
    h.passenger_count_confirmed != null ? `${h.passenger_count_confirmed} passengers` : null,
    h.parcel_count_confirmed != null ? `${h.parcel_count_confirmed} parcels` : null,
    h.keys_transferred ? "keys handed over" : "keys NOT handed over",
  ].filter(Boolean);

  return (
    <form action={submit} className="mt-3 space-y-2 rounded-lg border border-amber bg-amber-bg p-3">
      <p className="text-sm font-semibold text-amber-text">
        {h.from_driver_name} is handing {h.vehicle_registration} over to you
        {h.stop_label ? ` at ${h.stop_label}` : ""}.
      </p>
      <p className="text-sm text-slate-800">{facts.join(" · ")}</p>
      {h.notes && <p className="text-sm text-slate-800">“{h.notes}”</p>}
      <label className={labelCls} htmlFor={`sign-${h.handover_id}`}>
        Check the above, then type your full name to confirm
      </label>
      <input id={`sign-${h.handover_id}`} name="signature" autoComplete="name" className={field} />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-dark py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving..." : "Confirm & take over"}
      </button>
    </form>
  );
}
