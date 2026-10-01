"use client";

import Link from "next/link";
import { useActionState } from "react";
import { convertBookingRequest, waitlistBookingRequest } from "@/app/actions/bookingRequests";

/** "Create booking", and — if the departure has no room — "Add to waitlist". */
export function ConvertRequest({ id }: { id: string }) {
  const [state, convert, converting] = useActionState(convertBookingRequest, null);
  const [wlState, waitlist, waitlisting] = useActionState(waitlistBookingRequest, null);
  const busy = converting || waitlisting;

  return (
    <div className="space-y-2">
      <form
        action={convert}
        onSubmit={(e) => {
          if (!window.confirm("Create the passengers and a provisional booking from this request?")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={busy || !!state?.success || !!wlState?.success}
          className="rounded-button bg-brand-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {converting ? "Booking…" : "Create booking"}
        </button>
      </form>

      {state?.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-emerald-700">
          {state.message}{" "}
          {state.departureId && (
            <Link href={`/office/departures/${state.departureId}`} className="font-semibold underline">
              Open the departure
            </Link>
          )}
        </p>
      )}

      {state?.waitlist && !wlState?.success && (
        <form action={waitlist}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-button border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
          >
            {waitlisting ? "Adding…" : "Add to waitlist"}
          </button>
        </form>
      )}
      {wlState?.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {wlState.error}
        </p>
      )}
      {wlState?.success && (
        <p role="status" className="text-sm text-emerald-700">
          {wlState.message}{" "}
          {wlState.departureId && (
            <Link href={`/office/departures/${wlState.departureId}`} className="font-semibold underline">
              Open the departure
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
