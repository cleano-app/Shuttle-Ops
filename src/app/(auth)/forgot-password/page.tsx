"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/actions/auth";

const initialState: ForgotPasswordState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form action={formAction} className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Reset password</h1>
        <p className="mb-6 text-sm text-slate-500">
          Enter your email and we&apos;ll send a reset link.
        </p>

        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />

        {state?.error && <p className="mb-4 text-sm text-red-600">{state.error}</p>}
        {state?.success && (
          <p className="mb-4 text-sm text-green-700">
            If that email has an account, a reset link is on its way.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand-dark py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </div>
  );
}
