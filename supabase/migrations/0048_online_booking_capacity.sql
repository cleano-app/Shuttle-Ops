-- Build spec Phase 5 (§39): "Passengers may book online." The capacity
-- function remains the single source of truth for allocation (§12) — this
-- migration broadens allocate_booking_capacity()'s authorization check
-- rather than duplicating its ~200 lines of capacity logic for a separate
-- "online" path. The broadened path is deliberately narrow: a self-service
-- caller can only ever book FOR THEMSELVES (their own passenger_id, linked
-- via passenger_account_users — no family/group self-service booking in
-- Phase 5, a scope decision worth revisiting once account overlap is
-- actually built), can never set an override reason (§12's overridable
-- checks still exist for Office discretion; self-service never gets that
-- discretion), and can never claim to be booked_by an Office user.
create or replace function can_self_book_online(
  p_lead_passenger_id uuid,
  p_channel text,
  p_override_reason text,
  p_booked_by_user_id uuid,
  p_booking_passengers jsonb
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_channel = 'online'
    and p_override_reason is null
    and p_booked_by_user_id is null
    and exists (
      select 1 from passenger_account_users pau
      where pau.user_id = auth.uid() and pau.passenger_id = p_lead_passenger_id
    )
    and not exists (
      select 1 from jsonb_array_elements(p_booking_passengers) as p
      where (p->>'passenger_id')::uuid is distinct from p_lead_passenger_id
    );
$$;

grant execute on function can_self_book_online(uuid, text, text, uuid, jsonb) to authenticated;

-- allocate_booking_capacity: identical to 0018's version except the
-- authorization check at the top now also accepts a verified self-service
-- online booking, per can_self_book_online() above. Every capacity check
-- and insert below is byte-for-byte unchanged from 0018/0037.
create or replace function allocate_booking_capacity(
  p_departure_id uuid,
  p_lead_passenger_id uuid,
  p_channel text,
  p_booking_passengers jsonb,
  p_notes text default null,
  p_override_reason text default null,
  p_booked_by_user_id uuid default null,
  p_trip_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure departures%rowtype;
  v_booking_id uuid;
  v_reference text;
  v_cap_pct int;

  v_used_seats int;
  v_used_crossing int;
  v_used_hold int;
  v_used_wheelchair int;
  v_used_unsecured int;

  v_new_seats int;
  v_new_crossing int;
  v_new_hold int;
  v_new_wheelchair int;
  v_new_unsecured int;

  v_vehicle_id uuid;
  v_dv departure_vehicles%rowtype;
  v_dv_used_seats int;
  v_dv_used_hold int;
  v_dv_used_wheelchair int;
  v_dv_new_seats int;
  v_dv_new_hold int;
  v_dv_new_wheelchair int;
begin
  if not (
    is_office()
    or can_self_book_online(p_lead_passenger_id, p_channel, p_override_reason, p_booked_by_user_id, p_booking_passengers)
  ) then
    raise using message = 'not_authorized';
  end if;

  select * into v_departure from departures where id = p_departure_id for update;
  if not found then
    raise using message = 'departure_not_found';
  end if;
  if v_departure.status not in ('draft', 'published', 'boarding') then
    raise using message = 'departure_not_bookable';
  end if;

  select
    coalesce(sum(case when bp.occupies_seat then 1 else 0 end), 0),
    coalesce(count(*), 0),
    coalesce(sum(bp.luggage_units_consumed), 0),
    coalesce(sum(case when bp.wheelchair_space then 1 else 0 end), 0),
    coalesce(sum(case when bp.status in ('provisional', 'deposit_pending') then 1 else 0 end), 0)
  into v_used_seats, v_used_crossing, v_used_hold, v_used_wheelchair, v_used_unsecured
  from booking_passengers bp
  join bookings b on b.id = bp.booking_id
  where b.departure_id = p_departure_id
    and bp.status not in ('cancelled', 'expired');

  select
    coalesce(sum(case when (p->>'occupies_seat')::boolean then 1 else 0 end), 0),
    coalesce(jsonb_array_length(p_booking_passengers), 0),
    coalesce(sum((p->>'luggage_units_consumed')::int), 0),
    coalesce(sum(case when (p->>'wheelchair_space')::boolean then 1 else 0 end), 0),
    coalesce(sum(case when coalesce(p->>'status', 'provisional') in ('provisional', 'deposit_pending') then 1 else 0 end), 0)
  into v_new_seats, v_new_crossing, v_new_hold, v_new_wheelchair, v_new_unsecured
  from jsonb_array_elements(p_booking_passengers) p;

  if v_used_seats + v_new_seats > v_departure.seats_released then
    raise using
      message = 'no_seats',
      detail = format('%s of %s released seats remain', v_departure.seats_released - v_used_seats, v_departure.seats_released);
  end if;

  if v_departure.crossing_passenger_limit is not null
     and v_used_crossing + v_new_crossing > v_departure.crossing_passenger_limit then
    raise using message = 'crossing_limit_reached';
  end if;

  if p_override_reason is null
     and v_used_hold + v_new_hold > v_departure.hold_capacity_units then
    raise using message = 'no_hold_capacity';
  end if;

  if p_override_reason is null
     and v_used_wheelchair + v_new_wheelchair > v_departure.wheelchair_capacity then
    raise using message = 'no_wheelchair_space';
  end if;

  select unsecured_provisional_cap_pct into v_cap_pct from app_settings;
  if (v_used_unsecured + v_new_unsecured) > floor(v_departure.seats_released * v_cap_pct / 100.0) then
    raise using message = 'unsecured_cap_reached';
  end if;

  for v_vehicle_id in
    select distinct (p->>'departure_vehicle_id')::uuid
    from jsonb_array_elements(p_booking_passengers) p
    where p->>'departure_vehicle_id' is not null and p->>'departure_vehicle_id' <> ''
  loop
    select * into v_dv from departure_vehicles where id = v_vehicle_id and departure_id = p_departure_id;
    if not found then
      raise using message = 'no_vehicle_capacity', detail = 'departure_vehicle_id does not belong to this departure';
    end if;

    select
      coalesce(sum(case when bp.occupies_seat then 1 else 0 end), 0),
      coalesce(sum(bp.luggage_units_consumed), 0),
      coalesce(sum(case when bp.wheelchair_space then 1 else 0 end), 0)
    into v_dv_used_seats, v_dv_used_hold, v_dv_used_wheelchair
    from booking_passengers bp
    join bookings b on b.id = bp.booking_id
    where b.departure_id = p_departure_id
      and bp.departure_vehicle_id = v_vehicle_id
      and bp.status not in ('cancelled', 'expired');

    select
      coalesce(sum(case when (p->>'occupies_seat')::boolean then 1 else 0 end), 0),
      coalesce(sum((p->>'luggage_units_consumed')::int), 0),
      coalesce(sum(case when (p->>'wheelchair_space')::boolean then 1 else 0 end), 0)
    into v_dv_new_seats, v_dv_new_hold, v_dv_new_wheelchair
    from jsonb_array_elements(p_booking_passengers) p
    where (p->>'departure_vehicle_id')::uuid = v_vehicle_id;

    if p_override_reason is null and (
      v_dv_used_seats + v_dv_new_seats > v_dv.seats_capacity
      or v_dv_used_hold + v_dv_new_hold > v_dv.hold_capacity_units
      or v_dv_used_wheelchair + v_dv_new_wheelchair > v_dv.wheelchair_capacity
    ) then
      raise using message = 'no_vehicle_capacity', detail = format('vehicle %s is full', v_vehicle_id);
    end if;
  end loop;

  insert into bookings (trip_id, departure_id, lead_passenger_id, channel, status, booked_by_user_id, notes)
  values (p_trip_id, p_departure_id, p_lead_passenger_id, p_channel, 'provisional', p_booked_by_user_id, p_notes)
  returning id, reference into v_booking_id, v_reference;

  insert into booking_passengers (
    booking_id, passenger_id, category, occupies_seat, departure_vehicle_id,
    pickup_address_id, dropoff_address_id, pickup_address_snapshot, dropoff_address_snapshot,
    mobility_needs, wheelchair_space, currency, notional_fare, contribution, sponsored, subsidy,
    sponsor_org_id, deposit_required, deposit_status, luggage_large, luggage_small, luggage_hand,
    luggage_oversize, luggage_units_consumed, luggage_charge, status
  )
  select
    v_booking_id,
    (p->>'passenger_id')::uuid,
    p->>'category',
    (p->>'occupies_seat')::boolean,
    nullif(p->>'departure_vehicle_id', '')::uuid,
    nullif(p->>'pickup_address_id', '')::uuid,
    nullif(p->>'dropoff_address_id', '')::uuid,
    p->'pickup_address_snapshot',
    p->'dropoff_address_snapshot',
    p->>'mobility_needs',
    coalesce((p->>'wheelchair_space')::boolean, false),
    p->>'currency',
    coalesce((p->>'notional_fare')::numeric, 0),
    coalesce((p->>'contribution')::numeric, 0),
    coalesce((p->>'sponsored')::numeric, 0),
    coalesce((p->>'subsidy')::numeric, 0),
    nullif(p->>'sponsor_org_id', '')::uuid,
    coalesce((p->>'deposit_required')::boolean, false),
    coalesce(p->>'deposit_status', 'not_required'),
    coalesce((p->>'luggage_large')::int, 0),
    coalesce((p->>'luggage_small')::int, 0),
    coalesce((p->>'luggage_hand')::int, 0),
    coalesce((p->>'luggage_oversize')::int, 0),
    coalesce((p->>'luggage_units_consumed')::int, 0),
    coalesce((p->>'luggage_charge')::numeric, 0),
    coalesce(p->>'status', 'provisional')
  from jsonb_array_elements(p_booking_passengers) p;

  return jsonb_build_object('booking_id', v_booking_id, 'reference', v_reference);
end;
$$;

grant execute on function allocate_booking_capacity(uuid, uuid, text, jsonb, text, text, uuid, uuid) to authenticated;

-- create_online_trip_booking: the passenger-portal entry point, mirroring
-- allocate_trip_capacity()'s shape (always creates a trip row, return leg
-- optional) but scoped to a verified self-service caller only —
-- deliberately NOT reusing allocate_trip_capacity() itself, since that
-- function has its own separate is_office()-only gate (0018) that isn't
-- broadened here; duplicating its ~15 lines of trip-wiring is far safer
-- than widening a second, differently-shaped authorization surface.
-- channel/override_reason/booked_by_user_id are forced here rather than
-- trusted from the jsonb payload, so a self-service caller can't smuggle
-- 'phone'/an override through the online path.
create or replace function create_online_trip_booking(
  p_outbound jsonb, -- {departure_id, booking_passengers, notes}
  p_return jsonb default null -- {departure_id, booking_passengers, notes}
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_trip_id uuid;
  v_reference text;
  v_outbound_result jsonb;
  v_return_result jsonb := null;
begin
  select passenger_id into v_passenger_id
  from passenger_account_users
  where user_id = auth.uid();

  if v_passenger_id is null then
    raise using message = 'not_linked';
  end if;

  insert into trips (lead_passenger_id, status)
  values (v_passenger_id, 'provisional')
  returning id, reference into v_trip_id, v_reference;

  v_outbound_result := allocate_booking_capacity(
    (p_outbound->>'departure_id')::uuid,
    v_passenger_id,
    'online',
    p_outbound->'booking_passengers',
    p_outbound->>'notes',
    null,
    null,
    v_trip_id
  );
  update trips set outbound_booking_id = (v_outbound_result->>'booking_id')::uuid where id = v_trip_id;

  if p_return is not null then
    v_return_result := allocate_booking_capacity(
      (p_return->>'departure_id')::uuid,
      v_passenger_id,
      'online',
      p_return->'booking_passengers',
      p_return->>'notes',
      null,
      null,
      v_trip_id
    );
    update trips set return_booking_id = (v_return_result->>'booking_id')::uuid where id = v_trip_id;
  end if;

  return jsonb_build_object(
    'trip_id', v_trip_id,
    'reference', v_reference,
    'outbound', v_outbound_result,
    'return', v_return_result
  );
end;
$$;

grant execute on function create_online_trip_booking(jsonb, jsonb) to authenticated;
