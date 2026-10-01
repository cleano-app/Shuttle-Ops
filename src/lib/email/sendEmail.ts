import "server-only";
import { Resend } from "resend";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

/** True once RESEND_API_KEY and RESEND_FROM_EMAIL are set. */
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

/** Plain-text email through Resend. Throws if not configured or on failure. */
export async function sendEmail(input: {
  to: string[];
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}): Promise<{ id: string }> {
  if (!emailConfigured()) {
    throw new Error("Email provider not configured yet — add RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  });
  if (error || !data) throw new Error(error?.message ?? "Email send failed with no error detail.");
  return { id: data.id };
}
