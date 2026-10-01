import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/shell/AuthCard";
import { InstallButton } from "./InstallButton";

export const metadata: Metadata = { title: "Install Shuttle Ops" };

const steps = "list-decimal space-y-1 ps-5 text-sm text-subtle";

/** Public page: how to put Shuttle Ops on a phone, tablet or computer. */
export default function InstallPage() {
  return (
    <AuthCard>
      <h1 className="mb-1 text-xl font-semibold text-navy">Install the app</h1>
      <p className="mb-5 text-sm text-muted">
        Shuttle Ops installs straight from this website — no app store. It opens full-screen with its own icon.
      </p>

      <div className="mb-6">
        <InstallButton />
      </div>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy">iPhone or iPad (Safari)</h2>
        <ol className={steps}>
          <li>Open this page in Safari.</li>
          <li>Tap the Share button (square with an arrow).</li>
          <li>Choose “Add to Home Screen”, then “Add”.</li>
        </ol>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold text-navy">Android (Chrome)</h2>
        <ol className={steps}>
          <li>Tap “Install Shuttle Ops” above, or</li>
          <li>Open the ⋮ menu and choose “Install app” / “Add to Home screen”.</li>
        </ol>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-navy">Computer (Chrome or Edge)</h2>
        <ol className={steps}>
          <li>Click “Install Shuttle Ops” above, or</li>
          <li>Click the install icon at the right of the address bar.</li>
        </ol>
      </section>

      <div className="flex justify-between text-sm">
        <Link href="/login" className="text-muted underline">
          Staff sign in
        </Link>
        <Link href="/portal/login" className="text-muted underline">
          Passenger sign in
        </Link>
      </div>
    </AuthCard>
  );
}
