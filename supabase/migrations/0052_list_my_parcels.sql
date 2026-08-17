-- Missed in 0049: a passenger needs a way to see parcels THEY booked
-- online, same "curated security definer read, raw table stays locked"
-- pattern as list_my_bookings (0050).
create or replace function list_my_parcels() returns table(
  parcel_id uuid,
  reference text,
  departure_id uuid,
  route_name text,
  direction text,
  depart_at timestamptz,
  recipient_name text,
  size_category text,
  status text,
  price numeric,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pc.id, pc.reference, d.id, r.name, d.direction, d.depart_at,
    pc.recipient_name, pc.size_category, pc.status, pc.price, pc.currency
  from parcels pc
  join departures d on d.id = pc.departure_id
  join routes r on r.id = d.route_id
  join passenger_account_users pau on pau.passenger_id = pc.booked_online_by_passenger_id
  where pau.user_id = auth.uid()
  order by d.depart_at desc;
$$;

grant execute on function list_my_parcels() to authenticated;
