"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/actions/auth";
import { AuthCard } from "@/components/shell/AuthCard";
import { INPUT_CLASS, LABEL_CLASS, buttonClasses } from "@/components/ui/classes";

const initialState: ForgotPasswordState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <AuthCard>
      <form action={formAction}>
        <h1 className="mb-1 text-xl font-semibold text-navy">Reset password</h1>
        <p className="mb-6 text-sm text-muted">Enter your email and we&apos;ll send a reset link.</p>

        <label htmlFor="email" className={LABEL_CLASS}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={`mb-4 ${INPUT_CLASS}`} />

        {state?.error && <p className="mb-4 text-sm text-red">{state.error}</p>}
        {state?.success && (
          <p className="mb-4 text-sm text-green">If that email has an account, a reset link is on its way.</p>
        )}

        <button type="submit" disabled={pending} className={buttonClasses("primary")}>
          {pending ? "Sending..." : "Send reset link"}
        </button>
        <a href="/login" className="mt-4 block text-center text-sm text-muted underline">
          Back to sign in
        </a>
      </form>
    </AuthCard>
  );
}
