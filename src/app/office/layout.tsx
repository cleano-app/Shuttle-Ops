import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/actions/auth";

const NAV_ITEMS = [
  { href: "/office/dashboard", label: "Dashboard" },
  { href: "/office/booking-console", label: "Booking Console" },
  { href: "/office/departures", label: "Departures" },
  { href: "/office/dispatch", label: "Dispatch" },
  { href: "/office/passengers", label: "Passengers" },
  { href: "/office/vehicles", label: "Vehicles" },
  { href: "/office/tariffs", label: "Tariffs" },
  { href: "/office/areas", label: "Areas" },
];

export default async function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "driver") redirect("/driver");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <Link href="/office/dashboard" className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-900">Shuttle Ops</span>
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>
              {session.displayName}
              <span className="ml-1 text-slate-400">({session.role})</span>
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="flex items-center gap-2 overflow-x-auto px-4 py-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl p-4 focus:outline-none">
        {children}
      </main>
    </div>
  );
}
