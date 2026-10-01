"use client";

import { useState } from "react";
import type { CallOutcome } from "@/types/database";

export const OFFICE_CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "provisional_created", label: "Provisional booking" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "no_capacity", label: "No capacity" },
  { value: "enquiry_only", label: "Enquiry only" },
];

export function outcomeLabel(outcome: CallOutcome): string {
  return OFFICE_CALL_OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome;
}

export interface LoggedCall {
  outcome: CallOutcome;
  at: string;
  auto: boolean;
}

interface CallOutcomePanelProps {
  callerName: string | null;
  logged: LoggedCall[];
  suggested?: CallOutcome | null;
  busy: boolean;
  error: string | null;
  onLog: (outcome: CallOutcome, notes: string) => void;
  /** Notes save on blur once the call has an outcome. */
  onNotes: (notes: string) => void;
  onNewCall: () => void;
}

/**
 * Build spec §38 call logging. Auto-saves (owner, 1 Oct 2026): choosing an
 * outcome logs the call at once, changing it updates the same log, and
 * notes save when the field loses focus. Booked / provisional / waitlisted
 * are set automatically by the console when those actions succeed.
 */
export function CallOutcomePanel({
  callerName,
  logged,
  suggested,
  busy,
  error,
  onLog,
  onNotes,
  onNewCall,
}: CallOutcomePanelProps) {
  const [choice, setChoice] = useState<CallOutcome | "">("");
  const [notes, setNotes] = useState("");
  const value = choice || suggested || "";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-medium text-slate-900">Call outcome</h2>
        <button type="button" onClick={onNewCall} className="text-sm font-medium text-blue-900 underline">
          New call
        </button>
      </div>
      <p className="mb-2 text-xs text-slate-500">
        {callerName ? `Caller: ${callerName}` : "No caller selected — logged without a matched passenger."}
      </p>

      {logged.length > 0 && (
        <ul className="mb-2 space-y-1 text-sm">
          {logged.map((l) => (
            <li key={l.at} className="flex items-center gap-2 text-green-800">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-green-600" />
              Saved: {outcomeLabel(l.outcome)}
              {l.auto && <span className="text-xs text-slate-500">(automatic)</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <select
          value={value}
          onChange={(e) => {
            const next = e.target.value as CallOutcome | "";
            setChoice(next);
            if (next) onLog(next, notes);
          }}
          aria-label="Call outcome"
          className="min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Choose outcome...</option>
          {OFFICE_CALL_OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onNotes(notes)}
          placeholder="Notes (optional) — saved automatically"
          aria-label="Call notes"
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
        {busy && <p className="text-xs text-slate-500">Saving…</p>}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
          Call not logged: {error}
        </p>
      )}
    </section>
  );
}
