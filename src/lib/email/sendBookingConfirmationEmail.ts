import "server-only";
import { Resend } from "resend";

export interface BookingConfirmationEmailInput {
  to: string;
  passengerName: string;
  bookingReference: string;
  departAt: string; // ISO
  routeName: string;
}

export interface SendEmailResult {
  id: string;
}

// resend, same choice as Cleano Ops's own straightforward email path
// (Phase 1 plan open decision #3) — Cleano's production code actually uses
// Microsoft Graph, which needs a real M365 tenant/Azure app registration
// this new project doesn't have yet. Throws if RESEND_API_KEY isn't set so
// call sites (src/app/actions/notifications.ts) can log a
// 'skipped_not_configured' booking_messages row instead of failing the
// whole booking confirmation flow.
export async function sendBookingConfirmationEmail(
  input: BookingConfirmationEmailInput
): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error(
      "Email provider not configured yet — add RESEND_API_KEY and RESEND_FROM_EMAIL."
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const departDate = new Date(input.departAt).toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: input.to,
    subject: `Booking confirmed — ${input.bookingReference}`,
    text: [
      `Hi ${input.passengerName},`,
      "",
      `Your booking ${input.bookingReference} on ${input.routeName} is confirmed.`,
      `Departure: ${departDate}`,
      "",
      "Please contact the office if anything about your booking needs to change.",
    ].join("\n"),
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Email send failed with no error detail.");
  }

  return { id: data.id };
}
