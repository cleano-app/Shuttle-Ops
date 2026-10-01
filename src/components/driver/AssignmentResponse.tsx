"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToAssignment } from "@/app/actions/driver";

/**
 * Accept / decline a new assignment (respond_to_driver_assignment, 0027).
 * Compact variant for the home list, full-width banner for the route screen.
 */
export function AssignmentResponse({
  assignmentId,
  compact = false,
}: {
  assignmentId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  function respond(accept: boolean) {
    if (!accept && !window.confirm("Decline this run? The office will be told and it will leave your list.")) return;
    setError(null);
    startTransition(async () => {
      const res = await respondToAssignment(assignmentId, accept);
      if (res.error) {
        setError(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "No signal - try again when you're back online."
            : res.error
        );
        return;
      }
      setDone(accept ? "accepted" : "declined");
      router.refresh();
    });
  }

  if (done === "accepted") {
    return <p className="text-sm font-medium text-green">✓ Accepted</p>;
  }

  return (
    <div className={compact ? "" : "rounded-lg border border-amber bg-amber-bg p-3"}>
      {!compact && (
        <p className="mb-2 text-sm font-medium text-amber-text">New run - please confirm you&apos;ll drive it.</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => respond(true)}
          className="flex-1 rounded-lg bg-brand-dark px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving..." : "Accept"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => respond(false)}
          className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 disabled:opacity-60"
        >
          Decline
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
