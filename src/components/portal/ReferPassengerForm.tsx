"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { referPassenger } from "@/app/actions/referrer";
import { getTranslator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";
import type { PassengerCategory } from "@/types/database";

const CATEGORIES: PassengerCategory[] = ["man", "woman", "boy", "girl", "infant"];

export function ReferPassengerForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = getTranslator(locale);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<PassengerCategory>("man");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);
    const result = await referPassenger({ fullName, phone: phone || null, category });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    setFullName("");
    setPhone("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">{t("referrer_refer_title")}</h2>

      <input
        placeholder={t("auth_full_name")}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        placeholder={t("auth_phone")}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as PassengerCategory)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">✓</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("nav_refer")}
      </button>
    </form>
  );
}
