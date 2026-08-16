import "server-only";

export interface SmsRequest {
  to: string;
  body: string;
}

export interface SmsResult {
  sid: string;
}

/**
 * Provider-agnostic hook for passenger SMS confirmations (build spec §39
 * Phase 1 scope, §2 lists Twilio or Aircall) — swap the body of this
 * function for a real call to Twilio once credentials exist. Call sites
 * (src/app/actions/notifications.ts) already catch this throwing and log a
 * 'skipped_not_configured' row to booking_messages rather than let a
 * missing provider block a booking confirmation — same pattern as
 * src/lib/payments/takepayments.ts, itself copied from Cleano Ops's
 * src/lib/sms/sendSms.ts.
 */
export async function sendSms(request: SmsRequest): Promise<SmsResult> {
  void request;
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_FROM_NUMBER
  ) {
    throw new Error(
      "SMS provider not configured yet — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER once available."
    );
  }

  // TODO: replace with the real Twilio API call once credentials exist.
  throw new Error("SMS sending not yet implemented.");
}
