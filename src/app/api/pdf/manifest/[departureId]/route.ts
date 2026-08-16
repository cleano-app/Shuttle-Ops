import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { generateManifestPdf, ManifestNotFoundError } from "@/lib/pdf/generateManifestPdf";

// Build spec §37's fallback manifest, on demand (the nightly-generated,
// emailed-the-evening-before version is Phase 4). Office/Dispatcher/Admin
// only — a manifest carries passenger names and phone numbers.
export async function GET(
  request: Request,
  context: { params: Promise<{ departureId: string }> }
) {
  const { departureId } = await context.params;

  const session = await getSession();
  const canView = !!session && ["admin", "office", "dispatcher"].includes(session.role);
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = await createClient();
    const buffer = await generateManifestPdf(supabase, departureId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="manifest_${departureId}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof ManifestNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
