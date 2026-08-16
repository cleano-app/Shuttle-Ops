-- allocate_booking_capacity / allocate_trip_capacity: build spec §12 — "All
-- allocation passes through one database function, inside a transaction
-- with the departure row locked." This is the centerpiece of Phase 1.
--
-- Locking technique verified against Cleano Ops's real book_bin_slot()
-- (supabase/migrations/0042_booking_slots.sql): `select ... for update` on
-- the contended row inside a security definer function serializes
-- concurrent attempts so two simultaneous office calls can never both
-- succeed past the true limit.
--
-- Checks run in the exact order given by §12:
--   1. released passenger seats, excluding non-seat-occupying infants — NEVER overridable
--   2. crossing passenger limit — NEVER overridable
--   3. hold/luggage capacity — overridable with a recorded reason
--   4. parcel allocation — documented no-op in Phase 1 (parcels table
--      doesn't exist until Phase 3; departures.parcel_units_reserved is a
--      manually-set Office field here, not validated against source rows)
--   5. wheelchair spaces — overridable
--   6. unsecured provisional cap — NEVER overridable (protects revenue integrity)
--   7. per-vehicle capacity, where booking_passengers specify a
--      departure_vehicle_id — overridable
--
-- Usage is always recomputed from booking_passengers/bookings source rows
-- before allocating — never read from a stored counter (§6/§12).
create or replace function allocate_booking_capacity(
  p_departure_id uuid,
  p_lead_passenger_id uuid,
  p_channel text,
  p_booking_passengers jsonb, -- array of row objects matching booking_passengers columns
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
  if not is_office() then
    raise using message = 'not_authorized';
  end if;

  select * into v_departure from departures where id = p_departure_id for update;
  if not found then
    raise using message = 'departure_not_found';
  end if;
  if v_departure.status not in ('draft', 'published', 'boarding') then
    raise using message = 'departure_not_bookable';
  end if;

  -- Existing usage, recomputed from source rows. "Active" = anything that
  -- has ever consumed capacity and hasn't been explicitly released;
  -- cancelled/expired free the capacity, no_show/travelled do not (the
  -- seat was genuinely used or held right up to departure).
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

  -- New usage, from the payload about to be inserted.
  select
    coalesce(sum(case when (p->>'occupies_seat')::boolean then 1 else 0 end), 0),
    coalesce(jsonb_array_length(p_booking_passengers), 0),
    coalesce(sum((p->>'luggage_units_consumed')::int), 0),
    coalesce(sum(case when (p->>'wheelchair_space')::boolean then 1 else 0 end), 0),
    coalesce(sum(case when coalesce(p->>'status', 'provisional') in ('provisional', 'deposit_pending') then 1 else 0 end), 0)
  into v_new_seats, v_new_crossing, v_new_hold, v_new_wheelchair, v_new_unsecured
  from jsonb_array_elements(p_booking_passengers) p;

  -- 1. seats — never overridable (§12: "Office may never oversell passenger seats")
  if v_used_seats + v_new_seats > v_departure.seats_released then
    raise using
      message = 'no_seats',
      detail = format('%s of %s released seats remain', v_departure.seats_released - v_used_seats, v_departure.seats_released);
  end if;

  -- 2. crossing limit — never overridable (§12: "...or the booked crossing limit")
  if v_departure.crossing_passenger_limit is not null
     and v_used_crossing + v_new_crossing > v_departure.crossing_passenger_limit then
    raise using message = 'crossing_limit_reached';
  end if;

  -- 3. hold/luggage capacity — overridable
  if p_override_reason is null
     and v_used_hold + v_new_hold > v_departure.hold_capacity_units then
    raise using message = 'no_hold_capacity';
  end if;

  -- 4. parcel allocation — documented no-op in Phase 1. `no_parcel_capacity`
  -- is a reserved failure code (declared in TS as a constant for forward
  -- compatibility) but is never raised here, since the `parcels` table
  -- doesn't exist until Phase 3.

  -- 5. wheelchair spaces — overridable
  if p_override_reason is null
     and v_used_wheelchair + v_new_wheelchair > v_departure.wheelchair_capacity then
    raise using message = 'no_wheelchair_space';
  end if;

  -- 6. unsecured provisional cap — never overridable. A waived deposit
  -- counts as secured (§10), so only 'provisional'/'deposit_pending' rows
  -- count against the cap — 'confirmed'/'travelled' do not.
  select unsecured_provisional_cap_pct into v_cap_pct from app_settings;
  if (v_used_unsecured + v_new_unsecured) > floor(v_departure.seats_released * v_cap_pct / 100.0) then
    raise using message = 'unsecured_cap_reached';
  end if;

  -- 7. per-vehicle capacity, only where the payload specifies a
  -- departure_vehicle_id — overridable. The single-vehicle case (every
  -- departure_vehicle_id null) skips this loop entirely, per §7: "Null
  -- means this departure runs one vehicle, no assignment needed."
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

  -- All checks passed — insert.
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

-- allocate_trip_capacity: build spec §9 — "Where both legs are booked
-- together, allocation is transactional: both succeed or neither does."
-- A plpgsql function body runs inside the same transaction as the
-- top-level statement that invoked it (the RPC call itself). If the return
-- leg's call to allocate_booking_capacity() raises, the exception
-- propagates out of this function uncaught, aborting the whole statement —
-- Postgres then rolls back everything since the transaction began,
-- including the trip row and the outbound booking inserted moments
-- earlier. No explicit rollback/savepoint handling is needed for this to
-- be true.
create or replace function allocate_trip_capacity(
  p_lead_passenger_id uuid,
  p_outbound jsonb, -- {departure_id, channel, booking_passengers, notes, override_reason}
  p_return jsonb default null,
  p_booked_by_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_reference text;
  v_outbound_result jsonb;
  v_return_result jsonb := null;
begin
  if not is_office() then
    raise using message = 'not_authorized';
  end if;

  insert into trips (lead_passenger_id, status)
  values (p_lead_passenger_id, 'provisional')
  returning id, reference into v_trip_id, v_reference;

  v_outbound_result := allocate_booking_capacity(
    (p_outbound->>'departure_id')::uuid,
    p_lead_passenger_id,
    p_outbound->>'channel',
    p_outbound->'booking_passengers',
    p_outbound->>'notes',
    p_outbound->>'override_reason',
    p_booked_by_user_id,
    v_trip_id
  );
  update trips set outbound_booking_id = (v_outbound_result->>'booking_id')::uuid where id = v_trip_id;

  if p_return is not null then
    v_return_result := allocate_booking_capacity(
      (p_return->>'departure_id')::uuid,
      p_lead_passenger_id,
      p_return->>'channel',
      p_return->'booking_passengers',
      p_return->>'notes',
      p_return->>'override_reason',
      p_booked_by_user_id,
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

grant execute on function allocate_trip_capacity(uuid, jsonb, jsonb, uuid) to authenticated;
