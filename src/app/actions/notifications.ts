"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { sendBookingConfirmationEmail } from "@/lib/email/sendBookingConfirmationEmail";
import { sendSms } from "@/lib/sms/sendSms";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

function isOffice(role: string) {
  return role === "admin" || role === "office";
}

/**
 * Build spec §39 Phase 1 scope: "SMS/email confirmations." Sends both,
 * best-effort — a missing SMS/email provider must never block or fail the
 * booking itself, so both attempts are individually caught and logged to
 * booking_messages with status 'sent' | 'failed' | 'skipped_not_configured'
 * rather than throwing.
 */
export async function sendBookingConfirmation(bookingId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isOffice(session.role)) {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, reference, departure_id, lead_passenger_id")
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking) return { error: "Booking not found." };

  const [{ data: passenger }, { data: departure }] = await Promise.all([
    supabase
      .from("passengers")
      .select("id, full_name, email, phone, preferred_language")
      .eq("id", booking.lead_passenger_id)
      .single(),
    supabase
      .from("departures")
      .select("depart_at, route_id, routes(name)")
      .eq("id", booking.departure_id)
      .single(),
  ]);

  if (!passenger) return { error: "Lead passenger not found." };

  const routeName =
    (departure as unknown as { routes?: { name?: string } } | null)?.routes?.name ??
    "your route";
  const departAt = (departure as { depart_at?: string } | null)?.depart_at ?? new Date().toISOString();

  if (passenger.email) {
    try {
      await sendBookingConfirmationEmail({
        to: passenger.email,
        passengerName: passenger.full_name,
        bookingReference: booking.reference,
        departAt,
        routeName,
      });
      await logBookingMessage(supabase, {
        booking_id: booking.id,
        passenger_id: passenger.id,
        channel: "email",
        category: "booking_confirmation",
        recipient: passenger.email,
        subject: `Booking confirmed — ${booking.reference}`,
        body: "Booking confirmation email",
        status: "sent",
        created_by_user_id: session.userId,
      });
    } catch (err) {
      await logBookingMessage(supabase, {
        booking_id: booking.id,
        passenger_id: passenger.id,
        channel: "email",
        category: "booking_confirmation",
        recipient: passenger.email,
        body: "Booking confirmation email",
        status: err instanceof Error && err.message.includes("not configured")
          ? "skipped_not_configured"
          : "failed",
        created_by_user_id: session.userId,
      });
    }
  }

  if (passenger.phone) {
    try {
      await sendSms({
        to: passenger.phone,
        body: `Booking ${booking.reference} confirmed on ${routeName}, departing ${new Date(departAt).toLocaleString("en-GB")}.`,
      });
      await logBookingMessage(supabase, {
        booking_id: booking.id,
        passenger_id: passenger.id,
        channel: "sms",
        category: "booking_confirmation",
        recipient: passenger.phone,
        body: "Booking confirmation SMS",
        status: "sent",
        created_by_user_id: session.userId,
      });
    } catch (err) {
      await logBookingMessage(supabase, {
        booking_id: booking.id,
        passenger_id: passenger.id,
        channel: "sms",
        category: "booking_confirmation",
        recipient: passenger.phone,
        body: "Booking confirmation SMS",
        status: err instanceof Error && err.message.includes("not configured")
          ? "skipped_not_configured"
          : "failed",
        created_by_user_id: session.userId,
      });
    }
  }

  return { success: true };
}

async function logBookingMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: {
    booking_id: string;
    passenger_id: string;
    channel: "email" | "sms";
    category: string;
    recipient: string;
    subject?: string;
    body: string;
    status: "sent" | "failed" | "skipped_not_configured";
    created_by_user_id: string;
  }
) {
  await supabase.from("booking_messages").insert(row);
}
