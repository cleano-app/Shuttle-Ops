import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth/session";
import { generateManifestPdf, ManifestNotFoundError } from "@/lib/pdf/generateManifestPdf";

// Build spec §37's fallback manifest, on demand. A manifest carries
// passenger names and phone numbers, so who may download it is decided
// here, explicitly:
//  - Admin/Office: read through their own session (RLS lets them see it all).
//  - Dispatcher: passenger tables are Office-only under RLS (0058 gives
//    dispatch a curated function instead), so after the role check the PDF
//    is built with the service client - otherwise every name prints blank.
//  - Driver: only for a published departure they're actively assigned to
//    (checked through get_driver_assignments(), which is scoped to the
//    caller); §37 says the manifest is sent to assigned drivers anyway.
export async function GET(
  request: Request,
  context: { params: Promise<{ departureId: string }> }
) {
  const { departureId } = await context.params;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let useServiceClient = false;
  if (session.role === "admin" || session.role === "office") {
    useServiceClient = false;
  } else if (session.role === "dispatcher") {
    useServiceClient = true;
  } else if (session.role === "driver") {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_driver_assignments");
    const mine = !error && ((data ?? []) as { departure_id: string }[]).some((a) => a.departure_id === departureId);
    if (!mine) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    useServiceClient = true;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = useServiceClient ? createAdminClient() : await createClient();
    const buffer = await generateManifestPdf(supabase, departureId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="manifest_${departureId}.pdf"`,
        "Cache-Control": "private, no-store",
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
