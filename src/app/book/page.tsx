import type { Metadata } from "next";
import { BookingRequestWizard } from "@/components/book/BookingRequestWizard";
import { LogoMark } from "@/components/shell/Logo";
import { loadPublicDays } from "./days";

// Public booking REQUEST page (owner, 1 Oct 2026: "a customer self booking
// like bin booking, same style"). Open to everyone — see the always-open
// list in src/proxy.ts. It reads only the public departure list
// (list_public_departures, 0050) and writes only through
// submit_booking_request (0063); Office confirms by phone and takes the
// deposit. Rendered per request: the seats left are live.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a seat — London ⇄ Antwerp",
  description: "Request seats on the London ⇄ Antwerp shuttle. We'll call you to confirm.",
};

export default async function BookPage({ searchParams }: { searchParams: Promise<{ dep?: string }> }) {
  const { dep } = await searchParams;
  const { days, failed } = await loadPublicDays();

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col bg-white">
      {failed ? (
        <div className="px-5 py-6">
          <header className="mb-7 flex items-center gap-2">
            <LogoMark />
            <span className="text-[17px] font-bold tracking-tight text-brand-dark">Book a seat</span>
          </header>
          <div className="rounded-card bg-white px-5 py-8 text-center shadow-card">
            <h1 className="text-xl font-bold text-navy">We can&apos;t load the trips right now</h1>
            <p className="mt-2 text-sm text-muted">
              Sorry — that&apos;s our end, not yours. Please refresh in a moment, or call the office and we&apos;ll book
              you in ourselves.
            </p>
          </div>
        </div>
      ) : (
        <BookingRequestWizard days={days} initialDepartureId={dep ?? null} />
      )}
    </main>
  );
}
