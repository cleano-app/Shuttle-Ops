import { createClient } from "@/lib/supabase/server";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";
import {
  confirmBookingPassenger,
  markNoShow,
} from "@/app/actions/bookings";
import { recordDeposit, waiveDeposit } from "@/app/actions/deposits";
import { recordCancellation } from "@/app/actions/cancellations";
import type { Currency, DepartureStatus } from "@/types/database";

interface Row {
  id: string;
  booking_id: string;
  status: string;
  category: string;
  currency: Currency;
  deposit_status: string;
  contribution: number;
  luggage_large: number;
  luggage_small: number;
  luggage_hand: number;
  luggage_oversize: number;
  wheelchair_space: boolean;
  mobility_needs: string | null;
  boarded_at: string | null;
  pickup_address_snapshot: { line1?: string; postcode?: string } | null;
  dropoff_address_snapshot: { line1?: string; postcode?: string } | null;
  passengers: { full_name: string; phone: string | null } | null;
  bookings: { reference: string; trips: { reference: string } | null } | null;
}

const STATUS_STYLE: Record<string, string> = {
  provisional: "bg-amber-50 text-amber-800 ring-amber-200",
  deposit_pending: "bg-amber-50 text-amber-800 ring-amber-200",
  confirmed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  travelled: "bg-sky-50 text-sky-800 ring-sky-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  expired: "bg-slate-100 text-slate-500 ring-slate-200",
  no_show: "bg-red-50 text-red-700 ring-red-200",
};

const DEPOSIT_LABEL: Record<string, string> = {
  not_required: "No deposit",
  required: "Deposit due",
  pending: "Deposit pending",
  secured: "Deposit taken",
  waived: "Deposit waived",
  released: "Deposit released",
  retained: "Deposit retained",
};

const OPEN = ["provisional", "deposit_pending"];
const btn = "rounded-lg border px-3 py-1.5 text-sm font-medium";

function addressText(a: Row["pickup_address_snapshot"]) {
  if (!a) return "—";
  return [a.line1, a.postcode].filter(Boolean).join(", ");
}

/**
 * Every passenger booked on a departure, with the Office decisions the
 * spec gives them: take or waive the deposit, confirm, cancel, no-show.
 * Before this the actions existed but no screen called them, so a phone
 * booking could never leave "provisional".
 */
export async function DepartureBookings({
  departureId,
  departureStatus,
  departAt,
}: {
  departureId: string;
  departureStatus: DepartureStatus;
  departAt: string;
}) {
  const supabase = await createClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase
      .from("booking_passengers")
      .select(
        "id, booking_id, status, category, currency, deposit_status, contribution, luggage_large, luggage_small, luggage_hand, luggage_oversize, wheelchair_space, mobility_needs, boarded_at, pickup_address_snapshot, dropoff_address_snapshot, passengers(full_name, phone), bookings!inner(reference, departure_id, trips!bookings_trip_id_fkey(reference))"
      )
      .eq("bookings.departure_id", departureId)
      .order("created_at", { ascending: true }),
    supabase.from("app_settings").select("default_deposit_gbp, default_deposit_eur").eq("id", true).maybeSingle(),
  ]);

  const rows = (data ?? []) as unknown as Row[];
  const active = rows.filter((r) => !["cancelled", "expired"].includes(r.status));
  const closed = rows.filter((r) => ["cancelled", "expired"].includes(r.status));
  const canNoShow = ["boarding", "departed", "completed"].includes(departureStatus);

  const counts = {
    open: active.filter((r) => OPEN.includes(r.status)).length,
    confirmed: active.filter((r) => r.status === "confirmed").length,
    travelled: active.filter((r) => r.status === "travelled").length,
  };

  function depositAmount(currency: Currency) {
    return currency === "EUR" ? settings?.default_deposit_eur ?? 20 : settings?.default_deposit_gbp ?? 20;
  }

  function renderRow(r: Row) {
    const name = r.passengers?.full_name ?? "Passenger";
    const ref = r.bookings?.trips?.reference ?? r.bookings?.reference;
    const symbol = r.currency === "EUR" ? "€" : "£";
    const luggage = [
      r.luggage_large && `${r.luggage_large} large`,
      r.luggage_small && `${r.luggage_small} small`,
      r.luggage_hand && `${r.luggage_hand} hand`,
      r.luggage_oversize && `${r.luggage_oversize} ${r.luggage_oversize === 1 ? "buggy" : "buggies"}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const isOpen = OPEN.includes(r.status);
    const depositOutstanding = isOpen && ["required", "pending"].includes(r.deposit_status);

    async function confirm(): Promise<FormResult> {
      "use server";
      return confirmBookingPassenger(r.id);
    }
    // Spec §11: every cancellation is recorded with the notice given and a
    // suggested outcome; Office decides the money side on the
    // Cancellations page, never automatically.
    async function cancel(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
      "use server";
      const noticeHours = Math.max(0, Math.floor((new Date(departAt).getTime() - Date.now()) / 3600_000));
      const result = await recordCancellation({
        bookingId: r.booking_id,
        bookingPassengerId: r.id,
        noticeHours,
        reasonText: String(formData.get("reason") ?? "").trim() || null,
        requestedVia: String(formData.get("via") ?? "phone") as "phone" | "office",
      });
      return result.error
        ? result
        : { success: true, message: `Cancelled. Suggested: ${result.suggested ?? "—"} — decide on the Cancellations page.` };
    }
    async function noShow(): Promise<FormResult> {
      "use server";
      return markNoShow(r.id);
    }
    async function takeDeposit(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
      "use server";
      const amount = Number(formData.get("amount"));
      if (!(amount > 0)) return { error: "Enter the deposit amount." };
      return recordDeposit({
        bookingPassengerId: r.id,
        amount,
        currency: r.currency,
        method: String(formData.get("method") ?? "cash"),
        notes: String(formData.get("notes") ?? "") || null,
      });
    }
    async function waive(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
      "use server";
      return waiveDeposit({
        bookingPassengerId: r.id,
        reasonCode: String(formData.get("reason") ?? "office_decision"),
        notes: String(formData.get("notes") ?? "") || null,
      });
    }

    return (
      <li key={r.id} className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">
              {name} <span className="font-normal text-slate-500">· {r.category}</span>
            </p>
            <p className="text-xs text-slate-500">
              {ref}
              {r.passengers?.phone ? ` · ${r.passengers.phone}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${STATUS_STYLE[r.status] ?? ""}`}>
              {r.status.replace("_", " ")}
            </span>
            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
              {DEPOSIT_LABEL[r.deposit_status] ?? r.deposit_status}
            </span>
            {r.boarded_at && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 ring-1 ring-sky-200">boarded</span>
            )}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="inline text-slate-400">From </dt>
            <dd className="inline">{addressText(r.pickup_address_snapshot)}</dd>
          </div>
          <div>
            <dt className="inline text-slate-400">To </dt>
            <dd className="inline">{addressText(r.dropoff_address_snapshot)}</dd>
          </div>
          <div>
            <dt className="inline text-slate-400">Luggage </dt>
            <dd className="inline">{luggage || "none"}</dd>
          </div>
          <div>
            <dt className="inline text-slate-400">Contribution </dt>
            <dd className="inline">
              {symbol}
              {Number(r.contribution).toFixed(2)}
              {r.wheelchair_space ? " · wheelchair" : ""}
            </dd>
          </div>
          {r.mobility_needs && (
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="inline text-slate-400">Mobility </dt>
              <dd className="inline">{r.mobility_needs}</dd>
            </div>
          )}
        </dl>

        {depositOutstanding && (
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 lg:grid-cols-2">
            <ActionForm action={takeDeposit} className="flex flex-wrap items-end gap-2" successText="Deposit recorded.">
              <label className="text-xs text-slate-500">
                Amount ({symbol})
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={depositAmount(r.currency)}
                  className="mt-0.5 block w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                Method
                <select
                  name="method"
                  className="mt-0.5 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="cash">Cash</option>
                  <option value="card_phone">Card by phone</option>
                  <option value="bank_transfer">Bank transfer</option>
                </select>
              </label>
              <button type="submit" className={`${btn} border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}>
                Take deposit
              </button>
            </ActionForm>
            <ActionForm action={waive} className="flex flex-wrap items-end gap-2" successText="Deposit waived.">
              <label className="text-xs text-slate-500">
                Waive because
                <select
                  name="reason"
                  className="mt-0.5 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="vulnerable">Vulnerable passenger</option>
                  <option value="referrer_arranged">Arranged by referrer</option>
                  <option value="regular_traveller">Regular, reliable traveller</option>
                  <option value="office_decision">Other office decision</option>
                </select>
              </label>
              <button type="submit" className={`${btn} border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}>
                Waive
              </button>
            </ActionForm>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isOpen && (
            <ActionForm action={confirm} successText="Confirmed.">
              <button
                type="submit"
                disabled={depositOutstanding}
                title={depositOutstanding ? "Take or waive the deposit first" : undefined}
                className={`${btn} border-transparent bg-brand-dark text-white disabled:cursor-not-allowed disabled:opacity-40`}
              >
                Confirm booking
              </button>
            </ActionForm>
          )}
          {r.status === "confirmed" && canNoShow && !r.boarded_at && (
            <ActionForm action={noShow} confirm={`Mark ${name} as a no-show?`}>
              <button type="submit" className={`${btn} border-red-200 text-red-700 hover:bg-red-50`}>
                No-show
              </button>
            </ActionForm>
          )}
          {(isOpen || r.status === "confirmed") && (
            <details className="group">
              <summary className={`${btn} cursor-pointer list-none border-slate-300 text-slate-600 hover:bg-slate-50`}>
                Cancel place…
              </summary>
              <ActionForm
                action={cancel}
                confirm={`Cancel ${name}'s place on this departure?`}
                className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3"
              >
                <label className="text-xs text-slate-500">
                  Asked by
                  <select
                    name="via"
                    className="mt-0.5 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="phone">Passenger, by phone</option>
                    <option value="office">Office decision</option>
                  </select>
                </label>
                <label className="min-w-[160px] flex-1 text-xs text-slate-500">
                  Reason
                  <input
                    name="reason"
                    className="mt-0.5 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <button type="submit" className={`${btn} border-red-200 bg-white text-red-700 hover:bg-red-50`}>
                  Cancel place
                </button>
              </ActionForm>
            </details>
          )}
        </div>
      </li>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">Passengers</h2>
        <p className="text-sm text-slate-500">
          {counts.confirmed} confirmed · {counts.open} awaiting confirmation
          {counts.travelled ? ` · ${counts.travelled} travelled` : ""}
        </p>
      </div>
      {error && <p className="p-4 text-sm text-red-700">{error.message}</p>}
      {active.length === 0 && !error ? (
        <p className="p-4 text-sm text-slate-500">
          No passengers yet. Book them from the{" "}
          <a href="/office/booking-console" className="font-medium text-brand-dark underline">
            Booking Console
          </a>
          .
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">{active.map(renderRow)}</ul>
      )}
      {closed.length > 0 && (
        <details className="border-t border-slate-200 p-4 text-sm text-slate-500">
          <summary className="cursor-pointer">{closed.length} cancelled or expired</summary>
          <ul className="mt-2 space-y-1">
            {closed.map((r) => (
              <li key={r.id}>
                {r.passengers?.full_name ?? "Passenger"} · {r.status}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
