"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOnlineParcelBooking } from "@/app/actions/portalParcels";
import { PortalAddressAutocomplete, type PortalAddressOption } from "./PortalAddressAutocomplete";
import { getTranslator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";
import type { Currency, ParcelSizeCategory, PublicDepartureAvailability } from "@/types/database";

const SIZES: ParcelSizeCategory[] = ["small", "medium", "large", "oversize"];

export function BookParcelForm({
  locale,
  departures,
}: {
  locale: Locale;
  departures: PublicDepartureAvailability[];
}) {
  const router = useRouter();
  const t = getTranslator(locale);
  const [departureId, setDepartureId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAddress, setRecipientAddress] = useState<PortalAddressOption | null>(null);
  const [sizeCategory, setSizeCategory] = useState<ParcelSizeCategory>("small");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!departureId || !recipientName.trim() || !declared) {
      setError("Please fill in the departure, recipient name, and confirm the declaration.");
      return;
    }
    setPending(true);
    const result = await createOnlineParcelBooking({
      departureId,
      recipientName,
      recipientPhone: recipientPhone || null,
      recipientAddressId: recipientAddress?.id ?? null,
      sizeCategory,
      description: description || null,
      prohibitedItemsDeclared: declared,
      currency,
    });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReference(result.reference ?? null);
    router.refresh();
  }

  if (reference) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="font-medium text-green-800">Booked — reference {reference}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">{t("parcels_book")}</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t("book_departure")}</label>
        <select
          value={departureId}
          onChange={(e) => setDepartureId(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {departures.map((d) => (
            <option key={d.departure_id} value={d.departure_id}>
              {d.route_name} · {d.direction} ·{" "}
              {new Date(d.depart_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </option>
          ))}
        </select>
      </div>

      <input
        placeholder={t("parcels_recipient_name")}
        value={recipientName}
        onChange={(e) => setRecipientName(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        placeholder={t("parcels_recipient_phone")}
        value={recipientPhone}
        onChange={(e) => setRecipientPhone(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <PortalAddressAutocomplete
        label={t("book_dropoff")}
        value={recipientAddress?.line1 ?? ""}
        onSelect={(a) => setRecipientAddress(a)}
      />

      <div className="flex gap-2">
        <select
          value={sizeCategory}
          onChange={(e) => setSizeCategory(e.target.value as ParcelSizeCategory)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
        </select>
      </div>

      <textarea
        placeholder={t("parcels_description")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
        {t("parcels_prohibited_declared")}
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("parcels_submit")}
      </button>
    </form>
  );
}
