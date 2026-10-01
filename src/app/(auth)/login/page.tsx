"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { AuthCard } from "@/components/shell/AuthCard";
import { INPUT_CLASS, LABEL_CLASS, buttonClasses } from "@/components/ui/classes";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <AuthCard>
      <form action={formAction}>
        <h1 className="mb-1 text-xl font-semibold text-navy">Sign in</h1>
        <p className="mb-6 text-sm text-muted">Staff sign in</p>

        <label htmlFor="email" className={LABEL_CLASS}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={`mb-4 ${INPUT_CLASS}`} />

        <label htmlFor="password" className={LABEL_CLASS}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={`mb-2 ${INPUT_CLASS}`}
        />
        <a href="/forgot-password" className="mb-4 block text-end text-sm text-muted underline">
          Forgot password?
        </a>

        {state?.error && <p className="mb-4 text-sm text-red">{state.error}</p>}

        <button type="submit" disabled={pending} className={buttonClasses("primary")}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <a href="/install" className="mt-6 block text-center text-sm text-muted underline">
        Install the app on this device
      </a>
    </AuthCard>
  );
}
