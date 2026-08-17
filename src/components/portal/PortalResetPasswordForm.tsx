"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getTranslator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function PortalResetPasswordForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = getTranslator(locale);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push("/portal/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">{t("auth_new_password_title")}</h1>
          <LanguageSwitcher current={locale} />
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_new_password")}</label>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand-dark py-2 font-medium text-white disabled:opacity-50"
        >
          {t("auth_new_password_save")}
        </button>
      </form>
    </div>
  );
}
