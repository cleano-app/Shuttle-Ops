-- Fixes a real regression in 0048: that migration's allocate_booking_
-- capacity() was copied from 0018's ORIGINAL Phase 1 body, not 0037's
-- Phase 3 update that made the hold-capacity check also count existing
-- parcels' units_consumed against the same shared hold_capacity_units
-- pool (§15: "Parcels share physical hold capacity with passenger
-- luggage"). 0048 silently reverted that — caught by
-- tests/integration/parcelCapacity.test.ts failing after 0048 shipped.
-- Same fix pattern as 0037 itself used over 0018: a follow-up
-- create-or-replace rather than editing an already-applied migration
-- file in place.
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
  v_used_parcel_hold int;
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

  -- Parcels sharing the same hold pool (§15) — restored from 0037.
  select coalesce(sum(units_consumed), 0)
  into v_used_parcel_hold
  from parcels
  where departure_id = p_departure_id
    and status not in ('cancelled', 'failed_collection', 'failed_delivery');

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

  -- Hold capacity now counts existing parcels too (v_used_parcel_hold) —
  -- restored from 0037, missing in 0048.
  if p_override_reason is null
     and (v_used_hold + v_used_parcel_hold + v_new_hold) > v_departure.hold_capacity_units then
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
