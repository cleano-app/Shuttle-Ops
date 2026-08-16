-- departure_capacity_summary: read-only view so the Office Booking
-- Console's live capacity display (build spec §32) doesn't duplicate
-- allocate_booking_capacity()'s aggregation logic in TypeScript. Flagged as
-- an implementation-time addition in the Phase 1 plan (§8, open decision
-- #6) — not a capacity gate itself, just a display convenience; the
-- Postgres function in 0018 remains the sole source of truth for whether a
-- booking is actually allowed.
create or replace view departure_capacity_summary as
select
  d.id as departure_id,
  d.seats_capacity,
  d.seats_released,
  d.hold_capacity_units,
  d.wheelchair_capacity,
  d.crossing_passenger_limit,
  coalesce(sum(case when bp.occupies_seat then 1 else 0 end), 0)::int as seats_used,
  coalesce(count(bp.id), 0)::int as crossing_headcount,
  coalesce(sum(bp.luggage_units_consumed), 0)::int as hold_used,
  coalesce(sum(case when bp.wheelchair_space then 1 else 0 end), 0)::int as wheelchair_used,
  coalesce(sum(case when bp.status in ('provisional', 'deposit_pending') then 1 else 0 end), 0)::int as unsecured_count,
  coalesce(sum(case when bp.category = 'man' then 1 else 0 end), 0)::int as men,
  coalesce(sum(case when bp.category = 'woman' then 1 else 0 end), 0)::int as women,
  coalesce(sum(case when bp.category = 'boy' then 1 else 0 end), 0)::int as boys,
  coalesce(sum(case when bp.category = 'girl' then 1 else 0 end), 0)::int as girls,
  coalesce(sum(case when bp.category = 'infant' then 1 else 0 end), 0)::int as infants
from departures d
left join bookings b on b.departure_id = d.id
left join booking_passengers bp on bp.booking_id = b.id and bp.status not in ('cancelled', 'expired')
group by d.id;

-- Views inherit RLS from their underlying tables by default only when
-- created by a role that itself has RLS applied to it at query time; to be
-- explicit and avoid relying on that, grant matches departures'/
-- booking_passengers' access (is_dispatcher() for departures-level fields,
-- but booking_passengers is Office-only) — so this view is Office-only too,
-- consistent with booking_passengers' own deny-by-default policy.
alter view departure_capacity_summary set (security_invoker = on);

grant select on public.departure_capacity_summary to authenticated;
