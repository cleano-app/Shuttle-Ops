-- Extends get_driver_stop_manifest() (0027) to include parcels at each
-- stop now that parcels/operational_stop_parcels exist (0035), and adds
-- the parcel mutation functions a driver needs (collect/deliver/fail) —
-- same driver_covers_stop()-scoped, security-definer pattern as the
-- Phase 2 passenger stop functions, so parcels get exactly the same
-- driver-can-only-touch-their-own-assigned-stop guarantee.
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
      ), '[]'::jsonb),
      -- Recipient/sender contact shown only for the role relevant at THIS
      -- stop (collection shows sender, delivery shows recipient) - a
      -- driver collecting a parcel has no operational need for the
      -- recipient's phone number, and vice versa.
      'parcels', coalesce((
        select jsonb_agg(jsonb_build_object(
          'operational_stop_parcel_id', ostp.id,
          'parcel_id', pc.id,
          'reference', pc.reference,
          'role', ostp.role,
          'contact_name', case when ostp.role = 'collection' then pc.sender_name else pc.recipient_name end,
          'contact_phone', case when ostp.role = 'collection' then pc.sender_phone else pc.recipient_phone end,
          'size_category', pc.size_category,
          'quantity', pc.quantity,
          'description', pc.description,
          'special_instructions', pc.special_instructions,
          'status', pc.status
        ))
        from operational_stop_parcels ostp
        join parcels pc on pc.id = ostp.parcel_id
        where ostp.operational_stop_id = os.id
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

-- record_parcel_collected / record_parcel_delivered / record_parcel_failed:
-- the parcel equivalents of record_stop_arrival/departure/problem.
create or replace function record_parcel_collected(p_operational_stop_parcel_id uuid, p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ostp operational_stop_parcels%rowtype;
  v_stop operational_stops%rowtype;
  v_vehicle_id uuid;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_ostp from operational_stop_parcels where id = p_operational_stop_parcel_id for update;
  if not found then
    raise using message = 'not_found';
  end if;
  select * into v_stop from operational_stops where id = v_ostp.operational_stop_id;
  if not driver_covers_stop(v_stop.departure_id, v_stop.planned_sequence) then
    raise using message = 'not_your_stop';
  end if;

  update parcels set status = 'onboard', collected_at = coalesce(collected_at, now()) where id = v_ostp.parcel_id;

  select vehicle_id into v_vehicle_id from driver_assignments
    where departure_id = v_stop.departure_id and driver_id = auth.uid()
    order by assigned_at desc limit 1;
  insert into driver_duty_events (driver_id, vehicle_id, departure_id, event_type, client_id)
  values (auth.uid(), v_vehicle_id, v_stop.departure_id, 'arrived', p_client_id)
  on conflict (client_id) do nothing;

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function record_parcel_collected(uuid, uuid) to authenticated;

create or replace function record_parcel_delivered(
  p_operational_stop_parcel_id uuid,
  p_signature_name text default null,
  p_proof_photo_path text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ostp operational_stop_parcels%rowtype;
  v_stop operational_stops%rowtype;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_ostp from operational_stop_parcels where id = p_operational_stop_parcel_id for update;
  if not found then
    raise using message = 'not_found';
  end if;
  select * into v_stop from operational_stops where id = v_ostp.operational_stop_id;
  if not driver_covers_stop(v_stop.departure_id, v_stop.planned_sequence) then
    raise using message = 'not_your_stop';
  end if;

  update parcels
    set status = 'delivered',
        delivered_at = coalesce(delivered_at, now()),
        proof_signature_name = coalesce(p_signature_name, proof_signature_name),
        proof_photo_path = coalesce(p_proof_photo_path, proof_photo_path)
    where id = v_ostp.parcel_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function record_parcel_delivered(uuid, text, text) to authenticated;

create or replace function record_parcel_failed(p_operational_stop_parcel_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ostp operational_stop_parcels%rowtype;
  v_stop operational_stops%rowtype;
  v_parcel parcels%rowtype;
  v_new_status text;
begin
  if not is_driver() then
    raise using message = 'not_authorized';
  end if;

  select * into v_ostp from operational_stop_parcels where id = p_operational_stop_parcel_id for update;
  if not found then
    raise using message = 'not_found';
  end if;
  select * into v_stop from operational_stops where id = v_ostp.operational_stop_id;
  if not driver_covers_stop(v_stop.departure_id, v_stop.planned_sequence) then
    raise using message = 'not_your_stop';
  end if;

  select * into v_parcel from parcels where id = v_ostp.parcel_id;
  v_new_status := case when v_ostp.role = 'collection' then 'failed_collection' else 'failed_delivery' end;

  update parcels set status = v_new_status, failure_reason = p_reason where id = v_ostp.parcel_id;

  return jsonb_build_object('status', v_new_status);
end;
$$;

grant execute on function record_parcel_failed(uuid, text) to authenticated;
