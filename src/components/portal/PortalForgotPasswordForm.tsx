"use client";

import { useActionState } from "react";
import { requestPortalPasswordReset, type PortalAuthState } from "@/app/actions/portalAuth";
import { getTranslator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";
import { LanguageSwitcher } from "./LanguageSwitcher";

const initialState: PortalAuthState = {};

export function PortalForgotPasswordForm({ locale }: { locale: Locale }) {
  const [state, formAction, pending] = useActionState(requestPortalPasswordReset, initialState);
  const t = getTranslator(locale);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form action={formAction} className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">{t("auth_reset_title")}</h1>
          <LanguageSwitcher current={locale} />
        </div>
        <p className="mb-6 text-sm text-slate-500">{t("auth_reset_instructions")}</p>

        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_email")}</label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />

        {state?.error && <p className="mb-4 text-sm text-red-600">{state.error}</p>}
        {state?.success && <p className="mb-4 text-sm text-green-700">{t("auth_reset_sent")}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand-dark py-2 font-medium text-white disabled:opacity-50"
        >
          {t("auth_reset_send")}
        </button>
      </form>
    </div>
  );
}
