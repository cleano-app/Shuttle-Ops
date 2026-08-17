import { getLocale } from "@/lib/i18n/getLocale";
import { getTranslator } from "@/lib/i18n/translate";
import { getMyProfile } from "@/app/actions/portalBookings";
import { EditProfileForm } from "@/components/portal/EditProfileForm";

export default async function PortalProfilePage() {
  const locale = await getLocale();
  const t = getTranslator(locale);
  const { profile, error } = await getMyProfile();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t("profile_title")}</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {profile && <EditProfileForm locale={locale} profile={profile} />}
    </div>
  );
}
