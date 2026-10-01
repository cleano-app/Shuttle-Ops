-- Driver manifest fixes + handover context.
--
-- 1. get_driver_stop_manifest() (0027, extended in 0038) listed every
--    passenger linked to a stop, including ones whose booking had since
--    been cancelled or had expired - a driver would knock on the door of
--    someone who isn't travelling. Cancelled/expired booking passengers
--    and cancelled parcels are now left out. It also now refuses a
--    departure that isn't published yet (drafts are Office's working
--    copy; §31 "driver sees only their assigned ... departure").
--
-- 2. get_driver_handover_context(): the handover screen (§23 "Both
--    drivers confirm") needs the names of the other drivers on the same
--    departure and the handovers the driver is party to. profiles RLS
--    only lets a driver read their own row, so this is a curated
--    security-definer read - display name, vehicle and segment only,
--    never phone numbers or other drivers' other work.

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
  if not exists (
    select 1 from departures
    where id = p_departure_id and status in ('published', 'boarding', 'departed', 'completed')
  ) then
    raise using message = 'departure_not_published';
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
        ) order by p.full_name)
        from operational_stop_passengers osp
        join booking_passengers bp on bp.id = osp.booking_passenger_id
        join bookings b on b.id = bp.booking_id
        join passengers p on p.id = bp.passenger_id
        where osp.operational_stop_id = os.id
          and bp.status not in ('cancelled', 'expired')
          and b.status not in ('cancelled', 'expired')
      ), '[]'::jsonb),
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
        ) order by pc.reference)
        from operational_stop_parcels ostp
        join parcels pc on pc.id = ostp.parcel_id
        where ostp.operational_stop_id = os.id
          and pc.status <> 'cancelled'
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

create or replace function get_driver_handover_context(p_departure_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_crew jsonb;
  v_handovers jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id', da.id,
    'driver_id', da.driver_id,
    'display_name', pr.display_name,
    'is_me', da.driver_id = auth.uid(),
    'role', da.role,
    'vehicle_id', da.vehicle_id,
    'vehicle_registration', v.registration,
    'from_stop_sequence', da.from_stop_sequence,
    'to_stop_sequence', da.to_stop_sequence,
    'status', da.status
  ) order by coalesce(da.from_stop_sequence, -1), pr.display_name), '[]'::jsonb)
  into v_crew
  from driver_assignments da
  join profiles pr on pr.id = da.driver_id
  join vehicles v on v.id = da.vehicle_id
  where da.departure_id = p_departure_id
    and da.status in ('assigned', 'accepted');

  select coalesce(jsonb_agg(jsonb_build_object(
    'handover_id', h.id,
    'direction', case when h.from_driver_id = auth.uid() then 'outgoing' else 'incoming' end,
    'from_driver_name', pf.display_name,
    'to_driver_name', pt.display_name,
    'vehicle_registration', v.registration,
    'stop_label', coalesce(a.fixed_point_name, a.line1),
    'occurred_at', h.occurred_at,
    'odometer', h.odometer,
    'fuel_level', h.fuel_level,
    'cash_float_gbp', h.cash_float_gbp,
    'cash_float_eur', h.cash_float_eur,
    'passenger_count_confirmed', h.passenger_count_confirmed,
    'parcel_count_confirmed', h.parcel_count_confirmed,
    'keys_transferred', h.keys_transferred,
    'notes', h.notes,
    'from_signed', h.from_signature is not null,
    'to_signed', h.to_signature is not null
  ) order by h.created_at desc), '[]'::jsonb)
  into v_handovers
  from handovers h
  join profiles pf on pf.id = h.from_driver_id
  join profiles pt on pt.id = h.to_driver_id
  join vehicles v on v.id = h.vehicle_id
  left join operational_stops os on os.id = h.stop_id
  left join addresses a on a.id = os.address_id
  where h.departure_id = p_departure_id
    and (h.from_driver_id = auth.uid() or h.to_driver_id = auth.uid());

  return jsonb_build_object('crew', v_crew, 'handovers', v_handovers);
end;
$$;

revoke all on function get_driver_handover_context(uuid) from public, anon;
grant execute on function get_driver_handover_context(uuid) to authenticated;
