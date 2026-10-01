-- "Not known yet" passenger category (owner, 1 Oct 2026): on the phone a
-- caller often books "me and the family" before saying who is who, and
-- spec §33 already expects Office to confirm categories later. The
-- passenger still takes a seat (occupies_seat stays the booking's call);
-- only the man/woman/boy/girl/infant label waits.

alter table passengers drop constraint if exists passengers_category_check;
alter table passengers add constraint passengers_category_check
  check (category in ('man', 'woman', 'boy', 'girl', 'infant', 'unspecified'));

alter table booking_passengers drop constraint if exists booking_passengers_category_check;
alter table booking_passengers add constraint booking_passengers_category_check
  check (category in ('man', 'woman', 'boy', 'girl', 'infant', 'unspecified'));

-- Composition count for the new label. New view columns can only be
-- appended at the end (see 0039's note), so `unspecified` goes last.
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
  coalesce(sum(bp.luggage_units_consumed), 0)::int
    + coalesce((select sum(pc.units_consumed) from parcels pc
                where pc.departure_id = d.id
                  and pc.status not in ('cancelled', 'failed_collection', 'failed_delivery')), 0)::int
    as hold_used,
  coalesce(sum(case when bp.wheelchair_space then 1 else 0 end), 0)::int as wheelchair_used,
  coalesce(sum(case when bp.status in ('provisional', 'deposit_pending') then 1 else 0 end), 0)::int as unsecured_count,
  coalesce(sum(case when bp.category = 'man' then 1 else 0 end), 0)::int as men,
  coalesce(sum(case when bp.category = 'woman' then 1 else 0 end), 0)::int as women,
  coalesce(sum(case when bp.category = 'boy' then 1 else 0 end), 0)::int as boys,
  coalesce(sum(case when bp.category = 'girl' then 1 else 0 end), 0)::int as girls,
  coalesce(sum(case when bp.category = 'infant' then 1 else 0 end), 0)::int as infants,
  coalesce(sum(bp.luggage_units_consumed), 0)::int as luggage_units_used,
  coalesce((select sum(pc.units_consumed) from parcels pc
            where pc.departure_id = d.id
              and pc.status not in ('cancelled', 'failed_collection', 'failed_delivery')), 0)::int as parcel_units_used,
  coalesce((select count(*) from parcels pc
            where pc.departure_id = d.id
              and pc.status not in ('cancelled', 'failed_collection', 'failed_delivery')), 0)::int as parcel_count,
  coalesce(sum(case when bp.category = 'unspecified' then 1 else 0 end), 0)::int as unspecified
from departures d
left join bookings b on b.departure_id = d.id
left join booking_passengers bp on bp.booking_id = b.id and bp.status not in ('cancelled', 'expired')
group by d.id;

alter view departure_capacity_summary set (security_invoker = on);
grant select on public.departure_capacity_summary to authenticated;
