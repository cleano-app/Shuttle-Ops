import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { ActionForm, type FormResult } from "@/components/forms/ActionForm";
import { formatUk } from "@/lib/time";
import {
  deleteRouteTemplate,
  listAllRouteTemplates,
  setRouteTemplateActive,
} from "@/app/actions/routeTemplates";
import { journeyLabel } from "@/lib/journey";
import { JourneyBadge } from "@/components/JourneyBadge";
import { journeyStartColor } from "@/components/Journey";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-bg text-amber-text",
  published: "bg-teal-bg text-teal-text",
  boarding: "bg-teal-bg text-teal-text",
  departed: "bg-slate-100 text-slate-700",
};

function sinceYesterday() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export default async function DispatchListPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["admin", "office", "dispatcher"].includes(session.role)) redirect("/");

  const supabase = await createClient();
  // From yesterday on, so a run that's still going after midnight stays here.
  const since = sinceYesterday();
  const [{ data: departures, error }, { templates, error: templatesError }] = await Promise.all([
    supabase
      .from("departures")
      .select("id, direction, depart_at, status, routes(name)")
      .in("status", ["draft", "published", "boarding", "departed"])
      .gte("depart_at", since)
      .order("depart_at", { ascending: true }),
    listAllRouteTemplates(),
  ]);

  const ids = (departures ?? []).map((d) => d.id);
  const [{ data: stopRows }, { data: assignmentRows }] = ids.length
    ? await Promise.all([
        supabase.from("operational_stops").select("departure_id").in("departure_id", ids),
        supabase
          .from("driver_assignments")
          .select("departure_id, status")
          .in("departure_id", ids)
          .in("status", ["assigned", "accepted"]),
      ])
    : [{ data: [] }, { data: [] }];
  const stopCount = new Map<string, number>();
  for (const s of stopRows ?? []) stopCount.set(s.departure_id, (stopCount.get(s.departure_id) ?? 0) + 1);
  const driverCount = new Map<string, number>();
  for (const a of assignmentRows ?? []) driverCount.set(a.departure_id, (driverCount.get(a.departure_id) ?? 0) + 1);

  async function toggleTemplate(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return setRouteTemplateActive(String(formData.get("template_id")), formData.get("active") !== "true");
  }
  async function removeTemplate(_prev: FormResult | null, formData: FormData): Promise<FormResult> {
    "use server";
    return deleteRouteTemplate(String(formData.get("template_id")));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dispatch</h1>
        <p className="text-sm text-slate-500">
          Stops, route templates and driver/vehicle assignments per departure.
        </p>
      </div>

      {/* Tappable cards grouped by day (owner, 1 Oct 2026: "should be cards
          and tappable, no need for Open board"). */}
      {error && <p className="text-sm text-red-700">Couldn&apos;t load departures: {error.message}</p>}
      {!error && (!departures || departures.length === 0) ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No upcoming departures.</p>
      ) : (
        groupByDay(departures ?? []).map(([dayLabel, dayRows]) => (
          <section key={dayLabel} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{dayLabel}</h2>
            {dayRows.map((d) => {
              const routeName = (d as unknown as { routes?: { name?: string } }).routes?.name ?? "Route";
              const stops = stopCount.get(d.id) ?? 0;
              const drivers = driverCount.get(d.id) ?? 0;
              return (
                <Link
                  key={d.id}
                  href={`/office/dispatch/${d.id}`}
                  className="flex items-center gap-3 rounded-xl border border-s-4 border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 hover:bg-slate-50"
                  style={{ borderInlineStartColor: journeyStartColor(routeName, d.direction) }}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xl font-semibold text-slate-900">{formatUk(d.depart_at, { time: "short" })}</span>
                      <JourneyBadge routeName={routeName} direction={d.direction} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs font-medium">
                      <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLES[d.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {d.status}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 ${stops ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}
                      >
                        {stops ? `${stops} stop${stops === 1 ? "" : "s"}` : "No route yet"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 ${drivers ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}
                      >
                        {drivers ? `${drivers} driver${drivers === 1 ? "" : "s"}` : "No driver"}
                      </span>
                    </div>
                    {d.status === "draft" && (
                      <p className="text-xs text-amber-text">Draft - drivers won&apos;t see it until it&apos;s published.</p>
                    )}
                  </div>
                  <span aria-hidden className="text-2xl text-slate-300">
                    ›
                  </span>
                </Link>
              );
            })}
          </section>
        ))
      )}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-medium text-slate-900">Route templates</h2>
          <p className="text-sm text-slate-500">
            Save a departure&apos;s stop order as a template from its board, then apply it to new departures on the
            same route and direction.
          </p>
        </div>
        {templatesError && <p className="p-4 text-sm text-red-700">Couldn&apos;t load templates: {templatesError}</p>}
        {!templatesError && templates.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            No templates yet. Open a departure board, arrange its stops, and use &ldquo;Save stop order as
            template&rdquo;.
          </p>
        )}
        <ul className="divide-y divide-slate-200">
          {templates.map((t) => (
            <li key={t.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className={`font-medium ${t.active ? "text-slate-900" : "text-slate-400 line-through"}`}>{t.name}</p>
                  <p className="text-sm text-slate-500">
                    {journeyLabel(t.route_name, t.direction)} · {t.stops.length} stop{t.stops.length === 1 ? "" : "s"}
                    {!t.active && " · retired"}
                  </p>
                  {t.notes && <p className="text-sm text-slate-600">{t.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionForm action={toggleTemplate}>
                    <input type="hidden" name="template_id" value={t.id} />
                    <input type="hidden" name="active" value={String(t.active)} />
                    <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                      {t.active ? "Retire" : "Restore"}
                    </button>
                  </ActionForm>
                  <ActionForm action={removeTemplate} confirm={`Delete the template "${t.name}"? This can't be undone.`}>
                    <input type="hidden" name="template_id" value={t.id} />
                    <button type="submit" className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                      Delete
                    </button>
                  </ActionForm>
                </div>
              </div>
              {t.stops.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-brand-dark">Show stops</summary>
                  <ol className="mt-2 space-y-1 text-sm text-slate-700">
                    {t.stops.map((s, i) => (
                      <li key={s.id} className="flex gap-2">
                        <span className="w-6 shrink-0 text-right text-slate-400">{i + 1}.</span>
                        <span className="min-w-0 flex-1">
                          {s.label}{" "}
                          <span className="text-slate-500">
                            · {s.stop_type} · +{s.default_offset_minutes} min
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** [["Friday 2 October", rows…], …] by UK calendar day, in list order. */
function groupByDay<T extends { depart_at: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const d of rows) {
    const label = new Date(d.depart_at).toLocaleDateString("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    groups.set(label, [...(groups.get(label) ?? []), d]);
  }
  return [...groups.entries()];
}
