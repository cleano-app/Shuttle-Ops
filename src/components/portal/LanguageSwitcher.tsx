"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPortalLocale } from "@/app/actions/locale";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locales";

export function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      value={current}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await setPortalLocale(next);
          router.refresh();
        });
      }}
      className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
      aria-label="Language"
    >
      {LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {LOCALE_LABELS[locale]}
        </option>
      ))}
    </select>
  );
}
