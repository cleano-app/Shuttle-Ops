import "server-only";

export interface PaymentLinkRequest {
  depositId: string;
  amount: number;
  currency: string;
  passengerName: string;
  passengerEmail: string | null;
  description: string;
}

export interface PaymentLinkResult {
  url: string;
  reference: string;
}

/**
 * Provider-agnostic hook for taking a deposit or contribution online —
 * build spec §2 (Take Payments — MOTO for phone, hosted fields for web) and
 * §10's open question on pre-authorisation vs charge-then-refund. Live
 * payments are explicitly Phase 4 (§39) — in Phase 1, deposits are recorded
 * manually by Office (src/app/actions/deposits.ts) and this function is
 * never called, but the interface exists now so nothing downstream needs
 * to change shape once real merchant credentials arrive. Same
 * not-configured-yet pattern as Cleano Ops's src/lib/payments/
 * takepayments.ts.
 */
export async function createPaymentLink(
  request: PaymentLinkRequest
): Promise<PaymentLinkResult> {
  void request;
  if (!process.env.TAKEPAYMENTS_MERCHANT_ID || !process.env.TAKEPAYMENTS_API_KEY) {
    throw new Error(
      "Payment provider not configured yet — add TAKEPAYMENTS_MERCHANT_ID and TAKEPAYMENTS_API_KEY once takepayments.com merchant credentials are available."
    );
  }

  // TODO: replace with the real takepayments.com API call once we have
  // their merchant integration docs/sandbox credentials, and once §10's
  // pre-authorisation-vs-charge-then-refund question is resolved with them.
  throw new Error("takepayments.com integration not yet implemented.");
}
