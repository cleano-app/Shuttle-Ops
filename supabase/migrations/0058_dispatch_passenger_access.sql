-- Dispatcher access to the passengers a departure is carrying.
--
-- booking_passengers / bookings / passengers are Office-only under RLS
-- (0014, 0015, 0010) — they carry fares, deposits and vulnerability notes.
-- That left a Dispatcher-role user reading ZERO rows, so "Generate stops
-- from bookings" silently produced nothing and the dispatch board showed
-- every passenger as "Passenger". Build spec §4 gives Dispatcher
-- "Routing, stops, vehicle and driver assignments", which needs who is
-- travelling and from/to where, but never the money or welfare fields.
--
-- Same pattern as the driver manifest (0027/0038): the raw tables stay
-- locked, and a curated security-definer function hands back only the
-- operational fields. Drivers are rejected outright (is_dispatcher() is
-- admin/office/dispatcher only); their view stays get_driver_stop_manifest().

create or replace function get_dispatch_booking_passengers(p_departure_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if not is_dispatcher() then
    raise using message = 'not_authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_passenger_id', bp.id,
    'booking_id', b.id,
    'booking_reference', b.reference,
    'booking_status', b.status,
    'status', bp.status,
    'passenger_id', p.id,
    'full_name', p.full_name,
    'phone', p.phone,
    'category', bp.category,
    'occupies_seat', bp.occupies_seat,
    'departure_vehicle_id', bp.departure_vehicle_id,
    'pickup_address_id', bp.pickup_address_id,
    'dropoff_address_id', bp.dropoff_address_id,
    'mobility_needs', bp.mobility_needs,
    'wheelchair_space', bp.wheelchair_space,
    'luggage_large', bp.luggage_large,
    'luggage_small', bp.luggage_small,
    'luggage_hand', bp.luggage_hand,
    'luggage_oversize', bp.luggage_oversize,
    'no_show', bp.no_show,
    'boarded_at', bp.boarded_at
  ) order by b.created_at, bp.created_at), '[]'::jsonb)
  into v_rows
  from booking_passengers bp
  join bookings b on b.id = bp.booking_id
  join passengers p on p.id = bp.passenger_id
  where b.departure_id = p_departure_id;

  return v_rows;
end;
$$;

revoke all on function get_dispatch_booking_passengers(uuid) from public, anon;
grant execute on function get_dispatch_booking_passengers(uuid) to authenticated;
