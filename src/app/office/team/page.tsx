import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createStaffMember, listStaff, sendPasswordLink, updateStaffMember } from "@/app/actions/team";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const label = "block text-sm font-medium text-slate-700";
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  office: "Office",
  dispatcher: "Dispatcher",
  driver: "Driver",
};
const PAY_LABEL: Record<string, string> = { hourly: "per hour", per_trip: "per trip", per_day: "per day" };

type PayType = "hourly" | "per_trip" | "per_day";
type Role = "admin" | "office" | "dispatcher" | "driver";

function payFrom(formData: FormData) {
  const payType = String(formData.get("pay_type") ?? "") as PayType | "";
  const rate = String(formData.get("pay_rate") ?? "").trim();
  return { payType: payType || null, payRate: rate ? Number(rate) : null };
}

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "office") redirect("/office/dashboard");
  const isAdmin = session.role === "admin";
  const { staff, error } = await listStaff();

  async function add(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return createStaffMember({
      email: String(formData.get("email") ?? ""),
      displayName: String(formData.get("display_name") ?? ""),
      role: String(formData.get("role") ?? "driver") as Role,
      phone: String(formData.get("phone") ?? ""),
      ...payFrom(formData),
    });
  }

  const groups: Role[] = ["driver", "dispatcher", "office", "admin"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
        <p className="text-sm text-slate-500">
          Staff who sign in to Shuttle Ops. New people get an email to set their own password.
          {!isAdmin && " Office can add and edit drivers; an admin manages everyone else."}
        </p>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4" open={(staff ?? []).length < 2}>
        <summary className="cursor-pointer font-semibold text-slate-900">+ Add someone</summary>
        <ActionForm action={add} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={label}>
            Name
            <input name="display_name" required className={input} />
          </label>
          <label className={label}>
            Email
            <input name="email" type="email" required className={input} />
          </label>
          <label className={label}>
            Phone
            <input name="phone" type="tel" className={input} />
          </label>
          <label className={label}>
            Role
            <select name="role" defaultValue="driver" className={input}>
              {(isAdmin ? groups : (["driver"] as Role[])).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Driver pay
            <select name="pay_type" defaultValue="per_trip" className={input}>
              <option value="">Not set</option>
              <option value="hourly">Hourly</option>
              <option value="per_trip">Per trip</option>
              <option value="per_day">Per day</option>
            </select>
          </label>
          <label className={label}>
            Rate (£)
            <input name="pay_rate" type="number" step="0.01" min={0} className={input} />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white">
              Add and send invite
            </button>
          </div>
        </ActionForm>
      </details>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {groups.map((role) => {
        const people = (staff ?? []).filter((s) => s.role === role);
        if (people.length === 0) return null;
        return (
          <section key={role} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">
              {ROLE_LABEL[role]}s <span className="font-normal text-slate-500">· {people.length}</span>
            </h2>
            <ul className="divide-y divide-slate-200">
              {people.map((p) => {
                const editable = isAdmin || p.role === "driver";
                async function save(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
                  "use server";
                  return updateStaffMember(p.id, {
                    displayName: String(formData.get("display_name") ?? ""),
                    phone: String(formData.get("phone") ?? ""),
                    role: (String(formData.get("role") ?? "") || undefined) as Role | undefined,
                    ...payFrom(formData),
                  });
                }
                async function resend(): Promise<FormResult> {
                  "use server";
                  return sendPasswordLink(p.id);
                }
                return (
                  <li key={p.id} className="p-4">
                    <details>
                      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-slate-900">
                          {p.display_name}
                          {p.id === session.userId && <span className="font-normal text-slate-500"> (you)</span>}
                        </span>
                        <span className="text-sm text-slate-500">
                          {p.email}
                          {p.phone ? ` · ${p.phone}` : ""}
                          {p.role === "driver" && p.pay_rate != null && p.pay_type
                            ? ` · £${Number(p.pay_rate).toFixed(2)} ${PAY_LABEL[p.pay_type]}`
                            : ""}
                        </span>
                      </summary>
                      {editable ? (
                        <div className="mt-3 space-y-3">
                          <ActionForm action={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <label className={label}>
                              Name
                              <input name="display_name" defaultValue={p.display_name} required className={input} />
                            </label>
                            <label className={label}>
                              Phone
                              <input name="phone" defaultValue={p.phone ?? ""} className={input} />
                            </label>
                            {isAdmin && p.id !== session.userId ? (
                              <label className={label}>
                                Role
                                <select name="role" defaultValue={p.role} className={input}>
                                  {groups.map((r) => (
                                    <option key={r} value={r}>
                                      {ROLE_LABEL[r]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <span />
                            )}
                            <label className={label}>
                              Driver pay
                              <select name="pay_type" defaultValue={p.pay_type ?? ""} className={input}>
                                <option value="">Not set</option>
                                <option value="hourly">Hourly</option>
                                <option value="per_trip">Per trip</option>
                                <option value="per_day">Per day</option>
                              </select>
                            </label>
                            <label className={label}>
                              Rate (£)
                              <input
                                name="pay_rate"
                                type="number"
                                step="0.01"
                                min={0}
                                defaultValue={p.pay_rate ?? ""}
                                className={input}
                              />
                            </label>
                            <div className="sm:col-span-2 lg:col-span-5">
                              <button
                                type="submit"
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Save
                              </button>
                            </div>
                          </ActionForm>
                          <ActionForm action={resend}>
                            <button type="submit" className="text-sm font-medium text-brand-dark underline">
                              Email a set-password link
                            </button>
                          </ActionForm>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">Only an admin can change this account.</p>
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
