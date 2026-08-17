-- Build spec Phase 5 (§39): "Parcel booking" via the passenger portal.
-- Same broadening approach as 0048's allocate_booking_capacity — one
-- capacity function stays the source of truth rather than a duplicated
-- online-only parcel path. booked_online_by_passenger_id lets a passenger
-- look up parcels THEY submitted later (sender_name/phone alone isn't a
-- secure ownership key to filter by).
alter table parcels add column if not exists booked_online_by_passenger_id uuid references passengers(id);

create or replace function can_self_book_parcel_online(p_parcel jsonb) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from passenger_account_users pau
    where pau.user_id = auth.uid()
      and pau.passenger_id = nullif(p_parcel->>'booked_online_by_passenger_id', '')::uuid
  );
$$;

grant execute on function can_self_book_parcel_online(jsonb) to authenticated;

-- allocate_parcel_capacity: identical to 0037's version except the
-- authorization check and the new booked_online_by_passenger_id column on
-- the insert. Self-service can never set an override reason — that check
-- was already gated behind `p_override_reason is null`, and a self-service
-- caller has no legitimate way to pass a non-null one since the online
-- action layer never accepts one as input.
create or replace function allocate_parcel_capacity(
  p_departure_id uuid,
  p_parcel jsonb,
  p_override_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_departure departures%rowtype;
  v_used_hold int;
  v_used_parcel_hold int;
  v_new_units int;
  v_parcel_id uuid;
  v_reference text;
begin
  if not (is_office() or can_self_book_parcel_online(p_parcel)) then
    raise using message = 'not_authorized';
  end if;

  select * into v_departure from departures where id = p_departure_id for update;
  if not found then
    raise using message = 'departure_not_found';
  end if;
  if v_departure.status not in ('draft', 'published', 'boarding') then
    raise using message = 'departure_not_bookable';
  end if;

  select coalesce(sum(bp.luggage_units_consumed), 0)
  into v_used_hold
  from booking_passengers bp
  join bookings b on b.id = bp.booking_id
  where b.departure_id = p_departure_id
    and bp.status not in ('cancelled', 'expired');

  select coalesce(sum(units_consumed), 0)
  into v_used_parcel_hold
  from parcels
  where departure_id = p_departure_id
    and status not in ('cancelled', 'failed_collection', 'failed_delivery');

  v_new_units := coalesce((p_parcel->>'units_consumed')::int, 1);

  if p_override_reason is null
     and (v_used_hold + v_used_parcel_hold + v_new_units) > v_departure.hold_capacity_units then
    raise using message = 'no_hold_capacity';
  end if;

  insert into parcels (
    departure_id, sender_name, sender_phone, sender_address_id,
    recipient_name, recipient_phone, recipient_address_id,
    quantity, size_category, units_consumed, description, special_instructions,
    prohibited_items_declared, price, currency, created_by, booked_online_by_passenger_id
  )
  values (
    p_departure_id,
    p_parcel->>'sender_name',
    p_parcel->>'sender_phone',
    nullif(p_parcel->>'sender_address_id', '')::uuid,
    p_parcel->>'recipient_name',
    p_parcel->>'recipient_phone',
    nullif(p_parcel->>'recipient_address_id', '')::uuid,
    coalesce((p_parcel->>'quantity')::int, 1),
    p_parcel->>'size_category',
    v_new_units,
    p_parcel->>'description',
    p_parcel->>'special_instructions',
    coalesce((p_parcel->>'prohibited_items_declared')::boolean, false),
    coalesce((p_parcel->>'price')::numeric, 0),
    p_parcel->>'currency',
    nullif(p_parcel->>'created_by', '')::uuid,
    nullif(p_parcel->>'booked_online_by_passenger_id', '')::uuid
  )
  returning id, reference into v_parcel_id, v_reference;

  return jsonb_build_object('parcel_id', v_parcel_id, 'reference', v_reference);
end;
$$;

grant execute on function allocate_parcel_capacity(uuid, jsonb, text) to authenticated;
