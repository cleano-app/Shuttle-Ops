-- Extends departure_capacity_summary (0020) with a luggage/parcel
-- breakdown of hold_used, matching build spec §14's display:
--   Hold:  22 / 26 units
--      Luggage: 18
--      Parcels:  4
--
-- CREATE OR REPLACE VIEW requires every pre-existing column to keep its
-- exact name AND ordinal position - new columns can only be appended at
-- the very end (confirmed live: reordering them errors with "cannot
-- change name of view column"). So luggage_units_used/parcel_units_used/
-- parcel_count are appended after `infants`, not inserted next to
-- hold_used where they'd read more naturally.
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
              and pc.status not in ('cancelled', 'failed_collection', 'failed_delivery')), 0)::int as parcel_count
from departures d
left join bookings b on b.departure_id = d.id
left join booking_passengers bp on bp.booking_id = b.id and bp.status not in ('cancelled', 'expired')
group by d.id;

-- CREATE OR REPLACE VIEW should preserve reloptions, but setting this
-- explicitly removes any doubt rather than relying on that.
alter view departure_capacity_summary set (security_invoker = on);

grant select on public.departure_capacity_summary to authenticated;
