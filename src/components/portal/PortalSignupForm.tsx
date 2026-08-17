"use client";

import { useActionState } from "react";
import Link from "next/link";
import { portalSignup, type PortalAuthState } from "@/app/actions/portalAuth";
import { getTranslator } from "@/lib/i18n/translate";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";
import { LanguageSwitcher } from "./LanguageSwitcher";

const initialState: PortalAuthState = {};

export function PortalSignupForm({ locale }: { locale: Locale }) {
  const [state, formAction, pending] = useActionState(portalSignup, initialState);
  const t = getTranslator(locale);

  if (state?.success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-8 text-center shadow">
          <h1 className="mb-4 text-2xl font-semibold text-slate-900">{t("app_name")}</h1>
          <p className="text-slate-700">{t("auth_check_email")}</p>
          <Link href="/portal/login" className="mt-4 inline-block text-sm underline">
            {t("auth_sign_in")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form action={formAction} className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">{t("app_name")}</h1>
          <LanguageSwitcher current={locale} />
        </div>
        <p className="mb-6 text-sm text-slate-500">{t("auth_sign_up")}</p>

        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_full_name")}</label>
        <input
          name="full_name"
          required
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_phone")}</label>
        <input
          name="phone"
          type="tel"
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_email")}</label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_password")}</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_preferred_language")}</label>
        <select
          name="preferred_language"
          defaultValue={locale}
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </select>

        {state?.error && <p className="mb-4 text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand-dark py-2 font-medium text-white disabled:opacity-50"
        >
          {t("auth_sign_up")}
        </button>

        <p className="mt-4 text-center text-sm text-slate-500">
          {t("auth_have_account")}{" "}
          <Link href="/portal/login" className="underline">
            {t("auth_sign_in")}
          </Link>
        </p>
      </form>
    </div>
  );
}
