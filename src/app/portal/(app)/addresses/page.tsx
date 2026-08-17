import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { listMySavedAddresses, deleteMySavedAddress } from "@/app/actions/portalAddresses";
import { SaveAddressForm } from "@/components/portal/SaveAddressForm";

export default async function PortalAddressesPage() {
  const locale = await getLocale();
  const t = getTranslator(locale);
  const { addresses } = await listMySavedAddresses();

  async function remove(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteMySavedAddress(id);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t("nav_addresses")}</h1>

      <SaveAddressForm locale={locale} />

      <ul className="space-y-2">
        {addresses.map((a) => {
          const address = (a as unknown as { addresses?: { line1?: string; postcode?: string } }).addresses;
          return (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
            >
              <div>
                {a.label && <p className="text-sm font-medium text-slate-900">{a.label}</p>}
                <p className="text-sm text-slate-600">
                  {address?.line1}, {address?.postcode}
                </p>
              </div>
              <form action={remove}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="text-sm text-red-600 underline">
                  {t("addresses_delete")}
                </button>
              </form>
            </li>
          );
        })}
        {addresses.length === 0 && <li className="text-slate-500">{t("addresses_none")}</li>}
      </ul>
    </div>
  );
}
