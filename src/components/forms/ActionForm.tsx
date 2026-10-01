"use client";

import { useActionState, type ReactNode } from "react";

export interface FormResult {
  error?: string;
  success?: boolean;
  message?: string;
}

/**
 * A form that shows what its server action returned. Server-component
 * pages used to `await action()` and drop the result, so a refused
 * transition (unreconciled cash, wrong status, vehicle out of service)
 * looked like nothing happened. Pass a server action shaped
 * `(prev, formData) => Promise<FormResult>`.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  successText,
}: {
  action: (prev: FormResult | null, formData: FormData) => Promise<FormResult>;
  children: ReactNode;
  className?: string;
  /** Ask before submitting (for irreversible actions). */
  confirm?: string;
  /** Shown after a successful submit when the action has no message. */
  successText?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.error && (
        <p role="alert" className="mt-2 w-full basis-full text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      {state?.success && (state.message || successText) && (
        <p role="status" className="mt-2 w-full basis-full text-sm text-emerald-700">
          {state.message ?? successText}
        </p>
      )}
    </form>
  );
}
