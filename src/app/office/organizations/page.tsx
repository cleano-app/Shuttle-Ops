import {
  createOrganization,
  listOrganizations,
  linkOrganizationUser,
  listOrganizationUsers,
} from "@/app/actions/organizations";
import type { OrgType } from "@/types/database";

export default async function OrganizationsPage() {
  const { organizations } = await listOrganizations();

  async function addOrganization(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const orgType = String(formData.get("org_type") ?? "referrer") as OrgType;
    if (!name) return;
    await createOrganization({ name, org_type: orgType });
  }

  async function linkUser(formData: FormData) {
    "use server";
    const organizationId = String(formData.get("organization_id") ?? "");
    const email = String(formData.get("email") ?? "").trim();
    if (!organizationId || !email) return;
    await linkOrganizationUser({ organizationId, email });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Organizations</h1>
        <p className="text-sm text-slate-500">
          Referrer bodies and sponsors (build spec §39). Link a contact&apos;s email to give them portal
          access — they set their own password via &quot;forgot password&quot; on the portal login page.
        </p>
      </div>

      <form action={addOrganization} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input name="name" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
          <select name="org_type" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="referrer">Referrer</option>
            <option value="sponsor">Sponsor</option>
          </select>
        </div>
        <button type="submit" className="rounded bg-brand-dark px-4 py-2 text-sm font-medium text-white">
          Add organization
        </button>
      </form>

      <div className="space-y-4">
        {(organizations ?? []).map((org) => (
          <OrganizationRow key={org.id} org={org} linkUser={linkUser} />
        ))}
        {(!organizations || organizations.length === 0) && (
          <p className="text-sm text-slate-500">No organizations yet.</p>
        )}
      </div>
    </div>
  );
}

async function OrganizationRow({
  org,
  linkUser,
}: {
  org: { id: string; name: string; org_type: OrgType };
  linkUser: (formData: FormData) => Promise<void>;
}) {
  const { users } = await listOrganizationUsers(org.id);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="font-medium text-slate-900">
        {org.name} <span className="text-sm font-normal text-slate-500">({org.org_type})</span>
      </p>
      <p className="mt-1 text-sm text-slate-600">{users.length} linked portal account(s)</p>
      <form action={linkUser} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="organization_id" value={org.id} />
        <div className="flex-1">
          <label className="mb-1 block text-xs text-slate-600">Contact email</label>
          <input name="email" type="email" required className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button
          type="submit"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Link portal access
        </button>
      </form>
    </div>
  );
}
