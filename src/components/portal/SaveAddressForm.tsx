"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMyAddress } from "@/app/actions/portalAddresses";
import { PortalAddressAutocomplete, type PortalAddressOption } from "./PortalAddressAutocomplete";
import { getTranslator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";

export function SaveAddressForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = getTranslator(locale);
  const [existing, setExisting] = useState<PortalAddressOption | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [label, setLabel] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await saveMyAddress({
      existingAddressId: existing?.id ?? null,
      newAddress: showNew ? { line1, line2, city, postcode } : null,
      label: label || null,
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setExisting(null);
    setLabel("");
    setLine1("");
    setLine2("");
    setCity("");
    setPostcode("");
    setShowNew(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">{t("addresses_add")}</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("addresses_label")}</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {!showNew && (
        <>
          <PortalAddressAutocomplete
            label={t("addresses_search")}
            value={existing?.line1 ?? ""}
            onSelect={(a) => setExisting(a)}
          />
          <button type="button" onClick={() => setShowNew(true)} className="text-sm text-brand-dark underline">
            {t("addresses_new")}
          </button>
        </>
      )}

      {showNew && (
        <div className="space-y-2">
          <input
            placeholder={t("addresses_line1")}
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            placeholder={t("addresses_line2")}
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              placeholder={t("addresses_city")}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder={t("addresses_postcode")}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="w-32 rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button type="button" onClick={() => setShowNew(false)} className="text-sm text-slate-500 underline">
            {t("addresses_search")}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("addresses_save")}
      </button>
    </form>
  );
}
