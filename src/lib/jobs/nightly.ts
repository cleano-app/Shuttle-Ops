import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateManifestPdf } from "@/lib/pdf/generateManifestPdf";
import { emailConfigured, sendEmail } from "@/lib/email/sendEmail";
import { formatUk, isoToUkLocal, ukLocalToIso } from "@/lib/time";
import { journeyLabel } from "@/lib/journey";

type Admin = ReturnType<typeof createAdminClient>;

export interface JobReport {
  expiredBookings: number;
  fleetTasksCreated: number;
  legTimingsUpdated: number;
  manifests: { departure: string; sentTo: number; status: string }[];
  errors: string[];
}

/** Spec §10/§1.6: unsecured provisional holds release their capacity. */
async function expireProvisionalHolds(supabase: Admin, report: JobReport) {
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .in("status", ["provisional", "deposit_pending"])
    .lt("provisional_expires_at", new Date().toISOString());
  if (error) return void report.errors.push(`expiry: ${error.message}`);
  const ids = (data ?? []).map((b) => b.id);
  if (ids.length === 0) return;
  // Only passengers still unsecured expire; the booking row follows them
  // (trigger from migration 0056).
  const { error: bpError } = await supabase
    .from("booking_passengers")
    .update({ status: "expired" })
    .in("booking_id", ids)
    .in("status", ["provisional", "deposit_pending"])
    .not("deposit_status", "in", "(secured,waived)");
  if (bpError) return void report.errors.push(`expiry: ${bpError.message}`);
  report.expiredBookings = ids.length;
}

/** Spec §28: reminders 30 days before a vehicle document expires. */
async function documentExpiryTasks(supabase: Admin, report: JobReport) {
  const window = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const { data: docs, error } = await supabase
    .from("vehicle_documents")
    .select("id, vehicle_id, doc_type, expires_at")
    .not("expires_at", "is", null)
    .lte("expires_at", window);
  if (error) return void report.errors.push(`documents: ${error.message}`);
  for (const doc of docs ?? []) {
    const { count } = await supabase
      .from("fleet_tasks")
      .select("id", { count: "exact", head: true })
      .eq("source_document_id", doc.id)
      .in("status", ["open", "in_progress"]);
    if (count) continue;
    const { error: insertError } = await supabase.from("fleet_tasks").insert({
      vehicle_id: doc.vehicle_id,
      task_type: "document_expiry",
      title: `${doc.doc_type.toUpperCase()} expiring`,
      description: `Expires ${doc.expires_at}.`,
      due_date: doc.expires_at,
      created_from: "document_expiry_sweep",
      source_document_id: doc.id,
    });
    if (insertError) report.errors.push(`documents: ${insertError.message}`);
    else report.fleetTasksCreated += 1;
  }
}

/** Spec §19: nightly recompute of historical leg timings. */
async function legTimings(supabase: Admin, report: JobReport) {
  const { data, error } = await supabase.rpc("recompute_leg_timings");
  if (error) return void report.errors.push(`leg timings: ${error.message}`);
  report.legTimingsUpdated = (data as number | null) ?? 0;
}

/**
 * Spec §37: the evening before, a printable manifest per departure goes to
 * Office and the assigned drivers, so the run can happen off paper.
 */
async function tomorrowsManifests(supabase: Admin, report: JobReport) {
  const todayUk = isoToUkLocal(new Date().toISOString()).slice(0, 10);
  const tomorrow = new Date(`${todayUk}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const day = tomorrow.toISOString().slice(0, 10);
  const from = ukLocalToIso(`${day}T00:00`)!;
  const to = ukLocalToIso(`${day}T23:59`)!;

  const { data: departures, error } = await supabase
    .from("departures")
    .select("id, depart_at, direction, routes(name)")
    .in("status", ["published", "boarding"])
    .gte("depart_at", from)
    .lte("depart_at", to);
  if (error) return void report.errors.push(`manifests: ${error.message}`);
  if (!departures?.length) return;

  const { data: office } = await supabase.from("profiles").select("id").in("role", ["admin", "office"]);
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  // Never mail test logins (@*.dev / @*.test, switched-off accounts): they
  // bounce, and bounces hurt the sending domain.
  const emailOf = new Map(
    (users?.users ?? [])
      .filter(
        (u) =>
          u.email &&
          !/\.(dev|test|invalid|example)$/i.test(u.email) &&
          !(u.banned_until && new Date(u.banned_until) > new Date())
      )
      .map((u) => [u.id, u.email ?? ""])
  );

  for (const d of departures) {
    const name = `${journeyLabel((d as unknown as { routes?: { name?: string } }).routes?.name, d.direction)} ${formatUk(d.depart_at)}`;
    if (!emailConfigured()) {
      report.manifests.push({ departure: name, sentTo: 0, status: "skipped — email not configured" });
      continue;
    }
    const { data: assignments } = await supabase
      .from("driver_assignments")
      .select("driver_id")
      .eq("departure_id", d.id)
      .in("status", ["assigned", "accepted"]);
    const recipients = [
      ...new Set(
        [...(office ?? []).map((o) => o.id), ...(assignments ?? []).map((a) => a.driver_id)]
          .map((id) => emailOf.get(id))
          .filter((e): e is string => Boolean(e))
      ),
    ];
    if (recipients.length === 0) {
      report.manifests.push({ departure: name, sentTo: 0, status: "no recipients" });
      continue;
    }
    try {
      const pdf = await generateManifestPdf(supabase, d.id);
      await sendEmail({
        to: recipients,
        subject: `Manifest — ${name}`,
        text: [
          `Fallback manifest for ${name}, attached as a PDF.`,
          "",
          "Print it tonight. If the app or a phone is unavailable in the morning, run the departure from paper.",
        ].join("\n"),
        attachments: [{ filename: `manifest_${day}_${d.direction}.pdf`, content: pdf }],
      });
      report.manifests.push({ departure: name, sentTo: recipients.length, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.manifests.push({ departure: name, sentTo: 0, status: `failed: ${message}` });
      report.errors.push(`manifest ${name}: ${message}`);
    }
  }
}

export async function runNightlyJobs(): Promise<JobReport> {
  const supabase = createAdminClient();
  const report: JobReport = {
    expiredBookings: 0,
    fleetTasksCreated: 0,
    legTimingsUpdated: 0,
    manifests: [],
    errors: [],
  };
  await expireProvisionalHolds(supabase, report);
  await documentExpiryTasks(supabase, report);
  await legTimings(supabase, report);
  // Paused by the owner (1 Oct 2026: "no need tickets for now"). Set
  // MANIFEST_EMAILS=on in Vercel to send them again.
  if (process.env.MANIFEST_EMAILS === "on") await tomorrowsManifests(supabase, report);
  return report;
}
