"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-lg bg-white p-8 shadow"
      >
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">
          Shuttle Ops
        </h1>
        <p className="mb-6 text-sm text-slate-500">Staff sign in</p>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mb-2 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />
        <a
          href="/forgot-password"
          className="mb-4 block text-right text-sm text-slate-500 underline"
        >
          Forgot password?
        </a>

        {state?.error && (
          <p className="mb-4 text-sm text-red-600">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand-dark py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
