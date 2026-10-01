import { NextResponse } from "next/server";
import { runNightlyJobs } from "@/lib/jobs/nightly";

// Vercel Cron calls this once a day (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET set the route
// refuses everyone, so it can never be triggered from outside.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const report = await runNightlyJobs();
  return NextResponse.json(report, { status: report.errors.length ? 207 : 200 });
}
