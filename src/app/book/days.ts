import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dayDetails } from "@/lib/jewishCalendar";
import { formatUk, isoToUkLocal } from "@/lib/time";
import type { PublicDepartureAvailability } from "@/types/database";
import type { PublicDay } from "@/components/book/types";

const DAYS_AHEAD = 45;

/** Labels worth showing on a day card; parsha and minor days are noise here. */
function holidayLabel(day: string): string | null {
  const d = dayDetails(day);
  const shown = d.events.filter((e) => e.kind !== "parsha" && e.kind !== "minor").map((e) => e.label);
  if (shown.length) return shown.join(" · ");
  return d.isShabbos ? "Shabbos" : null;
}

/**
 * Published departures for the next ~45 days, reduced to what a stranger
 * may see: id, direction, route name, time and seats left. Reuses
 * list_public_departures (0050, granted to anon); its hold/wheelchair
 * numbers are dropped here and never reach the browser. No crossing info.
 */
export async function loadPublicDays(): Promise<{ days: PublicDay[]; failed: boolean }> {
  const supabase = await createClient();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await supabase.rpc("list_public_departures", { p_limit: 300 });
    if (!error) {
      const cutoff = Date.now() + DAYS_AHEAD * 86400_000;
      const rows = ((data ?? []) as PublicDepartureAvailability[]).filter(
        (d) => new Date(d.depart_at).getTime() <= cutoff
      );
      const days = rows.map((d): PublicDay => {
        const ukDay = isoToUkLocal(d.depart_at).slice(0, 10);
        const details = dayDetails(ukDay);
        return {
          id: d.departure_id,
          direction: d.direction === "return" ? "return" : "outbound",
          routeName: d.route_name,
          departAt: d.depart_at,
          seatsLeft: d.seats_available,
          weekday: new Date(d.depart_at).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long" }),
          date: new Date(d.depart_at).toLocaleDateString("en-GB", {
            timeZone: "Europe/London",
            day: "numeric",
            month: "short",
          }),
          time: formatUk(d.depart_at, { time: "short" }),
          hebrew: details.hebLabel,
          holiday: holidayLabel(ukDay),
        };
      });
      return { days, failed: false };
    }
    console.error(`[book] list_public_departures failed (attempt ${attempt}):`, error.message);
    if (attempt === 1) await new Promise((r) => setTimeout(r, 250));
  }
  return { days: [], failed: true };
}
