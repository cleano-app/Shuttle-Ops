"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMyProfile } from "@/app/actions/portalBookings";
import { getTranslator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";
import type { MyPassengerProfile } from "@/types/database";

export function EditProfileForm({ locale, profile }: { locale: Locale; profile: MyPassengerProfile }) {
  const router = useRouter();
  const t = getTranslator(locale);
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
  const [mobilityNeeds, setMobilityNeeds] = useState(profile.mobility_needs ?? "");
  const [emergencyName, setEmergencyName] = useState(profile.emergency_contact_name ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergency_contact_phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);
    const result = await updateMyProfile({
      fullName,
      phone: phone || null,
      email: email || null,
      preferredLanguage: profile.preferred_language,
      mobilityNeeds: mobilityNeeds || null,
      emergencyContactName: emergencyName || null,
      emergencyContactPhone: emergencyPhone || null,
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_full_name")}</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_phone")}</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth_email")}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("profile_mobility_needs")}</label>
        <textarea
          value={mobilityNeeds}
          onChange={(e) => setMobilityNeeds(e.target.value)}
          rows={2}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {t("profile_emergency_contact_name")}
        </label>
        <input
          value={emergencyName}
          onChange={(e) => setEmergencyName(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {t("profile_emergency_contact_phone")}
        </label>
        <input
          value={emergencyPhone}
          onChange={(e) => setEmergencyPhone(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">✓</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("profile_save")}
      </button>
    </form>
  );
}
