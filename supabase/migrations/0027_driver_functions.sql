-- Driver-facing security-definer functions. This is the ONLY way the
-- driver role reads or writes anything beyond driver_assignments/
-- driver_duty_events/handovers (its own three tables from 0023/0025/0026).
-- departures, operational_stops, operational_stop_passengers,
-- booking_passengers and passengers all keep the exact same RLS they had
-- at the end of Phase 1/the start of Phase 2 - no new grants for drivers
-- on any of them. Every function below checks is_driver() and re-derives
-- "is this actually your assignment" from driver_assignments via
-- driver_covers_stop() before touching or returning anything, so a
-- compromised client can't read or write outside its own assigned work no
-- matter what it sends.

-- get_driver_assignments: the driver app's own "what's my work" list.
-- Deliberately returns nothing about fares/deposits/vulnerability - just
-- enough to pick which departure to open (build spec §31: driver sees
-- their assigned vehicle, departure and segment, nothing else).
create or replace function get_driver_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id', da.id,
    'departure_id', d.id,
    'direction', d.direction,
    'depart_at', d.depart_at,
    'departure_status', d.status,
    'route_name', r.name,
    'vehicle_id', v.id,
    'vehicle_registration', v.registration,
    'from_stop_sequence', da.from_stop_sequence,
    'to_stop_sequence', da.to_stop_sequence,
    'assignment_status', da.status,
    'crossing_reference', d.crossing_reference,
    'crossing_checkin_deadline', d.crossing_checkin_deadline
  ) order by d.depart_at), '[]'::jsonb)
  into v_result
  from driver_assignments da
  join departures d on d.id = da.departure_id
  join routes r on r.id = d.route_id
  join vehicles v on v.id = da.vehicle_id
  where da.driver_id = auth.uid()
    and da.status in ('assigned', 'accepted')
    and d.status in ('published', 'boarding', 'departed');

  return v_result;
end;
$$;

grant execute on function get_driver_assignments() to authenticated;

-- get_driver_stop_manifest: the ordered stop list + safe passenger fields
-- for one departure, restricted to the caller's own covered stop range.
-- Passenger name/phone are included (driver needs to identify/contact
-- whoever they're collecting - build spec §31's mockup shows "Mr A",
-- "Mrs B"); vulnerability_notes, fares, deposits and any other
-- booking_passengers money columns are never selected here at all.
create or replace function get_driver_stop_manifest(p_departure_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stops jsonb;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;
  if not exists (
    select 1 from driver_assignments
    where departure_id = p_departure_id and driver_id = auth.uid() and status in ('assigned', 'accepted')
  ) then
    raise using message = 'not_your_departure';
  end if;

  select coalesce(jsonb_agg(stop_obj order by (stop_obj ->> 'planned_sequence')::int), '[]'::jsonb)
  into v_stops
  from (
    select jsonb_build_object(
      'stop_id', os.id,
      'address', jsonb_build_object(
        'line1', a.line1,
        'postcode', a.postcode,
        'fixed_point_name', a.fixed_point_name,
        'access_notes', a.access_notes,
        'latitude', a.latitude,
        'longitude', a.longitude
      ),
      'stop_type', os.stop_type,
      'planned_sequence', os.planned_sequence,
      'planned_arrival_at', os.planned_arrival_at,
      'actual_arrival_at', os.actual_arrival_at,
      'actual_departure_at', os.actual_departure_at,
      'status', os.status,
      'locked', os.locked,
      'driver_notes', os.driver_notes,
      'passengers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'operational_stop_passenger_id', osp.id,
          'role', osp.role,
          'boarded', osp.boarded,
          'full_name', p.full_name,
          'phone', p.phone,
          'category', bp.category,
          'mobility_needs', bp.mobility_needs,
          'wheelchair_space', bp.wheelchair_space,
          'luggage_large', bp.luggage_large,
          'luggage_small', bp.luggage_small,
          'luggage_hand', bp.luggage_hand,
          'luggage_oversize', bp.luggage_oversize,
          'no_show', bp.no_show
        ))
        from operational_stop_passengers osp
        join booking_passengers bp on bp.id = osp.booking_passenger_id
        join passengers p on p.id = bp.passenger_id
        where osp.operational_stop_id = os.id
      ), '[]'::jsonb)
    ) as stop_obj
    from operational_stops os
    join addresses a on a.id = os.address_id
    where os.departure_id = p_departure_id
      and driver_covers_stop(p_departure_id, os.planned_sequence)
  ) sub;

  return jsonb_build_object('stops', v_stops);
end;
$$;

grant execute on function get_driver_stop_manifest(uuid) to authenticated;

-- record_stop_arrival: the "Arrived" button (§31). Idempotent by
-- client_id for offline replay, and by only setting actual_arrival_at
-- once (first write wins) so a duplicate replay is a harmless no-op
-- rather than clobbering the original timestamp.
create or replace function record_stop_arrival(
  p_stop_id uuid,
  p_client_id uuid,
  p_odometer int default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stop operational_stops%rowtype;
  v_vehicle_id uuid;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_stop from operational_stops where id = p_stop_id for update;
  if not found then
    raise using message = 'stop_not_found';
  end if;
  if not driver_covers_stop(v_stop.departure_id, v_stop.planned_sequence) then
    raise using message = 'not_your_stop';
  end if;

  select vehicle_id into v_vehicle_id from driver_assignments
    where departure_id = v_stop.departure_id and driver_id = auth.uid()
    order by assigned_at desc limit 1;

  if v_stop.actual_arrival_at is null then
    update operational_stops set actual_arrival_at = now(), status = 'arrived' where id = p_stop_id;
  end if;

  insert into driver_duty_events (driver_id, vehicle_id, departure_id, event_type, client_id, odometer, note)
  values (auth.uid(), v_vehicle_id, v_stop.departure_id, 'arrived', p_client_id, p_odometer, p_note)
  on conflict (client_id) do nothing;

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function record_stop_arrival(uuid, uuid, int, text) to authenticated;

-- record_stop_departure: the "Collected"/move-on action. No duty_events
-- row - "departed a stop" isn't one of §24's seven duty event types
-- (start/arrived/break/fuel/border/handover/end are duty-level, not
-- per-stop); the stop's own status/actual_departure_at is the record.
create or replace function record_stop_departure(p_stop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stop operational_stops%rowtype;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_stop from operational_stops where id = p_stop_id for update;
  if not found then
    raise using message = 'stop_not_found';
  end if;
  if not driver_covers_stop(v_stop.departure_id, v_stop.planned_sequence) then
    raise using message = 'not_your_stop';
  end if;

  if v_stop.actual_departure_at is null then
    update operational_stops set actual_departure_at = now(), status = 'completed' where id = p_stop_id;
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function record_stop_departure(uuid) to authenticated;

-- record_stop_problem: the "Problem" button.
create or replace function record_stop_problem(p_stop_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stop operational_stops%rowtype;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_stop from operational_stops where id = p_stop_id for update;
  if not found then
    raise using message = 'stop_not_found';
  end if;
  if not driver_covers_stop(v_stop.departure_id, v_stop.planned_sequence) then
    raise using message = 'not_your_stop';
  end if;

  update operational_stops
    set status = 'problem',
        driver_notes = case when driver_notes is null or driver_notes = '' then p_note
                            else driver_notes || E'\n' || p_note end
    where id = p_stop_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function record_stop_problem(uuid, text) to authenticated;

-- record_passenger_boarded: per-passenger check-off within a stop.
-- Naturally idempotent (sets booleans), no client_id needed.
create or replace function record_passenger_boarded(
  p_operational_stop_passenger_id uuid,
  p_boarded boolean default true,
  p_no_show boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_osp operational_stop_passengers%rowtype;
  v_stop operational_stops%rowtype;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_osp from operational_stop_passengers where id = p_operational_stop_passenger_id for update;
  if not found then
    raise using message = 'not_found';
  end if;

  select * into v_stop from operational_stops where id = v_osp.operational_stop_id;
  if not driver_covers_stop(v_stop.departure_id, v_stop.planned_sequence) then
    raise using message = 'not_your_stop';
  end if;

  update operational_stop_passengers set boarded = p_boarded where id = p_operational_stop_passenger_id;
  update booking_passengers
    set boarded_at = case when p_boarded and boarded_at is null then now() else boarded_at end,
        no_show = p_no_show
    where id = v_osp.booking_passenger_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function record_passenger_boarded(uuid, boolean, boolean) to authenticated;

-- respond_to_driver_assignment: driver taps accept/decline on a new
-- assignment.
create or replace function respond_to_driver_assignment(p_assignment_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment driver_assignments%rowtype;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_assignment from driver_assignments where id = p_assignment_id for update;
  if not found or v_assignment.driver_id <> auth.uid() then
    raise using message = 'not_found';
  end if;

  update driver_assignments
    set status = case when p_accept then 'accepted' else 'declined' end,
        accepted_at = case when p_accept then now() else accepted_at end
    where id = p_assignment_id;

  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;

grant execute on function respond_to_driver_assignment(uuid, boolean) to authenticated;

-- create_handover / confirm_handover: build spec §23, "both drivers
-- confirm." The FROM driver creates the record with their own signature;
-- only the named TO driver can supply the second signature, and only
-- once - this is what actually enforces "both drivers confirm" rather
-- than either party being able to unilaterally complete the record.
create or replace function create_handover(
  p_departure_id uuid,
  p_vehicle_id uuid,
  p_to_driver_id uuid,
  p_stop_id uuid default null,
  p_odometer int default null,
  p_fuel_level text default null,
  p_cash_float_gbp numeric default null,
  p_cash_float_eur numeric default null,
  p_passenger_count_confirmed int default null,
  p_parcel_count_confirmed int default null,
  p_keys_transferred boolean default false,
  p_notes text default null,
  p_signature text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;
  if not exists (
    select 1 from driver_assignments
    where departure_id = p_departure_id and driver_id = auth.uid() and status in ('assigned', 'accepted')
  ) then
    raise using message = 'not_your_departure';
  end if;

  insert into handovers (
    departure_id, vehicle_id, stop_id, from_driver_id, to_driver_id, occurred_at, odometer, fuel_level,
    cash_float_gbp, cash_float_eur, passenger_count_confirmed, parcel_count_confirmed, keys_transferred,
    notes, from_signature
  ) values (
    p_departure_id, p_vehicle_id, p_stop_id, auth.uid(), p_to_driver_id, now(), p_odometer, p_fuel_level,
    p_cash_float_gbp, p_cash_float_eur, p_passenger_count_confirmed, p_parcel_count_confirmed, p_keys_transferred,
    p_notes, p_signature
  ) returning id into v_id;

  return jsonb_build_object('handover_id', v_id);
end;
$$;

grant execute on function create_handover(
  uuid, uuid, uuid, uuid, int, text, numeric, numeric, int, int, boolean, text, text
) to authenticated;

create or replace function confirm_handover(p_handover_id uuid, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handover handovers%rowtype;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_handover from handovers where id = p_handover_id for update;
  if not found or v_handover.to_driver_id <> auth.uid() then
    raise using message = 'not_found';
  end if;
  if v_handover.to_signature is not null then
    raise using message = 'already_confirmed';
  end if;

  update handovers set to_signature = p_signature where id = p_handover_id;

  return jsonb_build_object('status', 'confirmed');
end;
$$;

grant execute on function confirm_handover(uuid, text) to authenticated;
