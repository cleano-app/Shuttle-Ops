-- Build spec Phase 5 (§39): passenger self-service portal. Follows the
-- same security model as the driver app throughout this project — raw
-- tables carrying anyone-else's data (passengers, bookings,
-- booking_passengers, departure_capacity_summary's underlying joins) get
-- NO new direct RLS grants for the passenger role; every read/write goes
-- through a narrow security definer function that internally scopes to
-- the caller's own passenger_id (resolved via passenger_account_users).
-- The two exceptions are additions of broad, already-established
-- "any signed-in user can read this, it's not sensitive" policies
-- (departures, tariffs — mirrors the existing areas/routes/addresses
-- policies from Phase 1) and a brand-new table that only ever holds a
-- passenger's own rows (passenger_saved_addresses — same direct-RLS
-- pattern as driver_expenses/cash_transactions).

-- Departures/tariffs aren't sensitive on their own (dates, capacity
-- numbers, prices) — broadened the same way addresses/areas/routes
-- already were in Phase 1. draft departures stay invisible below via the
-- portal-facing functions' own status filter, not this policy (Office
-- still needs to see drafts, so the policy itself can't exclude them).
create policy departures_select_authenticated on departures for select
  using (auth.uid() is not null);

create policy tariffs_select_authenticated on tariffs for select
  using (auth.uid() is not null);

-- signup_passenger_account: self-service signup ALWAYS creates a brand
-- new passengers row rather than letting a new login "claim" an existing
-- phone-booked record by matching name/phone — that would let anyone
-- read another passenger's booking history just by knowing their name.
-- If a passenger already has phone-booked history, Office links the
-- accounts manually afterwards (passenger_account_users_office_manage,
-- 0011, already grants that).
create or replace function signup_passenger_account(
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_preferred_language text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
begin
  if exists (select 1 from passenger_account_users where user_id = auth.uid()) then
    raise using message = 'already_linked';
  end if;

  insert into passengers (full_name, phone, email, preferred_language, category, created_via)
  values (p_full_name, p_phone, p_email, p_preferred_language, 'man', 'online')
  returning id into v_passenger_id;

  insert into passenger_account_users (passenger_id, user_id)
  values (v_passenger_id, auth.uid());

  return v_passenger_id;
end;
$$;

grant execute on function signup_passenger_account(text, text, text, text) to authenticated;

-- get_my_passenger_profile: curated read — excludes vulnerability_notes
-- and is_vulnerable (Office's internal caseworker-style flag/notes about
-- a passenger, never shown back to the passenger themselves) and
-- referrer_org_id/deposit_waiver_standing/no_show_count/late_cancel_count
-- (Office-controlled signals, not something a passenger edits or needs to
-- see to use the portal).
create or replace function get_my_passenger_profile() returns table(
  id uuid,
  full_name text,
  phone text,
  email text,
  preferred_language text,
  mobility_needs text,
  default_pickup_address_id uuid,
  default_dropoff_address_id uuid,
  emergency_contact_name text,
  emergency_contact_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.phone, p.email, p.preferred_language, p.mobility_needs,
         p.default_pickup_address_id, p.default_dropoff_address_id,
         p.emergency_contact_name, p.emergency_contact_phone
  from passengers p
  join passenger_account_users pau on pau.passenger_id = p.id
  where pau.user_id = auth.uid();
$$;

grant execute on function get_my_passenger_profile() to authenticated;

create or replace function update_my_passenger_profile(
  p_full_name text,
  p_phone text,
  p_email text,
  p_preferred_language text,
  p_mobility_needs text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_default_pickup_address_id uuid default null,
  p_default_dropoff_address_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
begin
  select passenger_id into v_passenger_id from passenger_account_users where user_id = auth.uid();
  if v_passenger_id is null then
    raise using message = 'not_linked';
  end if;

  update passengers set
    full_name = p_full_name,
    phone = p_phone,
    email = p_email,
    preferred_language = p_preferred_language,
    mobility_needs = p_mobility_needs,
    emergency_contact_name = p_emergency_contact_name,
    emergency_contact_phone = p_emergency_contact_phone,
    default_pickup_address_id = p_default_pickup_address_id,
    default_dropoff_address_id = p_default_dropoff_address_id
  where id = v_passenger_id;
end;
$$;

grant execute on function update_my_passenger_profile(text, text, text, text, text, text, text, uuid, uuid) to authenticated;

-- list_my_bookings: the portal's "My bookings" list — curated join,
-- never exposes another passenger's row even though booking_passengers
-- itself has no direct RLS for this role.
create or replace function list_my_bookings() returns table(
  booking_id uuid,
  booking_reference text,
  booking_status text,
  departure_id uuid,
  route_name text,
  direction text,
  depart_at timestamptz,
  booking_passenger_id uuid,
  passenger_status text,
  notional_fare numeric,
  contribution numeric,
  currency text,
  deposit_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.reference, b.status,
    d.id, r.name, d.direction, d.depart_at,
    bp.id, bp.status, bp.notional_fare, bp.contribution, bp.currency, bp.deposit_status
  from bookings b
  join departures d on d.id = b.departure_id
  join routes r on r.id = d.route_id
  join booking_passengers bp on bp.booking_id = b.id
  join passenger_account_users pau on pau.passenger_id = b.lead_passenger_id
  where pau.user_id = auth.uid()
  order by d.depart_at desc;
$$;

grant execute on function list_my_bookings() to authenticated;

-- list_public_departures / get_public_departure_availability: the
-- portal's departure picker. Deliberately does NOT read
-- departure_capacity_summary (0020) — that view has
-- security_invoker = on, so querying it as a passenger would silently
-- see zero booking_passengers rows (no RLS grant for this role on that
-- table) and understate every departure as empty. These functions run
-- the same aggregation directly, as security definer, so the numbers are
-- always real regardless of caller. Only 'published'/'boarding'
-- departures are shown — 'draft' stays Office-internal.
create or replace function list_public_departures(p_limit int default 30) returns table(
  departure_id uuid,
  route_name text,
  direction text,
  depart_at timestamptz,
  status text,
  seats_available int,
  hold_available int,
  wheelchair_available int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    r.name,
    d.direction,
    d.depart_at,
    d.status,
    greatest(0, d.seats_released - coalesce(sum(case when bp.occupies_seat then 1 else 0 end), 0))::int,
    greatest(0, d.hold_capacity_units - coalesce(sum(bp.luggage_units_consumed), 0)
      - coalesce((select sum(units_consumed) from parcels
                  where departure_id = d.id and status not in ('cancelled', 'failed_collection', 'failed_delivery')), 0))::int,
    greatest(0, d.wheelchair_capacity - coalesce(sum(case when bp.wheelchair_space then 1 else 0 end), 0))::int
  from departures d
  join routes r on r.id = d.route_id
  left join bookings b on b.departure_id = d.id
  left join booking_passengers bp on bp.booking_id = b.id and bp.status not in ('cancelled', 'expired')
  where d.status in ('published', 'boarding') and d.depart_at > now()
  group by d.id, r.name
  order by d.depart_at asc
  limit p_limit;
$$;

grant execute on function list_public_departures(int) to authenticated, anon;

create or replace function get_public_departure_availability(p_departure_id uuid) returns table(
  departure_id uuid,
  route_name text,
  direction text,
  depart_at timestamptz,
  status text,
  seats_available int,
  hold_available int,
  wheelchair_available int,
  crossing_limit int,
  crossing_available int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    r.name,
    d.direction,
    d.depart_at,
    d.status,
    greatest(0, d.seats_released - coalesce(sum(case when bp.occupies_seat then 1 else 0 end), 0))::int,
    greatest(0, d.hold_capacity_units - coalesce(sum(bp.luggage_units_consumed), 0)
      - coalesce((select sum(units_consumed) from parcels
                  where departure_id = d.id and status not in ('cancelled', 'failed_collection', 'failed_delivery')), 0))::int,
    greatest(0, d.wheelchair_capacity - coalesce(sum(case when bp.wheelchair_space then 1 else 0 end), 0))::int,
    d.crossing_passenger_limit,
    case when d.crossing_passenger_limit is null then null
         else greatest(0, d.crossing_passenger_limit - coalesce(count(bp.id), 0))::int end
  from departures d
  join routes r on r.id = d.route_id
  left join bookings b on b.departure_id = d.id
  left join booking_passengers bp on bp.booking_id = b.id and bp.status not in ('cancelled', 'expired')
  where d.id = p_departure_id
  group by d.id, r.name;
$$;

grant execute on function get_public_departure_availability(uuid) to authenticated, anon;

-- passenger_saved_addresses: a passenger's own private shortlist, distinct
-- from the shared operational address book (addresses). Direct RLS is
-- safe here (unlike passengers/bookings) — this table only ever holds a
-- passenger's own rows and no third party's data, same reasoning as
-- driver_expenses/cash_transactions' direct self-scoped RLS.
create table if not exists passenger_saved_addresses (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references passengers(id) on delete cascade,
  address_id uuid not null references addresses(id),
  label text,
  is_default_pickup boolean not null default false,
  is_default_dropoff boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists passenger_saved_addresses_passenger_idx on passenger_saved_addresses (passenger_id);

alter table passenger_saved_addresses enable row level security;

create policy passenger_saved_addresses_self on passenger_saved_addresses for all
  using (
    exists (
      select 1 from passenger_account_users pau
      where pau.user_id = auth.uid() and pau.passenger_id = passenger_saved_addresses.passenger_id
    )
  )
  with check (
    exists (
      select 1 from passenger_account_users pau
      where pau.user_id = auth.uid() and pau.passenger_id = passenger_saved_addresses.passenger_id
    )
  );

create policy passenger_saved_addresses_office_manage on passenger_saved_addresses for all
  using (is_office())
  with check (is_office());

grant select, insert, update, delete on public.passenger_saved_addresses to authenticated;
grant select, insert, update, delete on public.passenger_saved_addresses to service_role;

-- create_passenger_address: the shared `addresses` table stays
-- dispatcher-managed for direct INSERT (0004) — this is a narrow, audited
-- entry point so a passenger can add a genuinely new address (their home,
-- typed for the first time) without opening the whole operational address
-- book to public writes. The client is expected to run search_addresses()
-- first (same fuzzy-dedup UX as the office console's AddressAutocomplete)
-- to nudge toward an existing entry before calling this.
create or replace function create_passenger_address(
  p_line1 text,
  p_line2 text,
  p_city text,
  p_postcode text,
  p_country text default 'GB',
  p_area_id uuid default null
) returns uuid
language sql
security definer
set search_path = public
as $$
  insert into addresses (line1, line2, city, postcode, country, area_id, address_type)
  values (p_line1, p_line2, p_city, p_postcode, p_country, p_area_id, 'residential')
  returning id;
$$;

grant execute on function create_passenger_address(text, text, text, text, text, uuid) to authenticated;

-- Cancellation requests (build spec §11/§39): a passenger can request a
-- cancellation of their OWN booking and see its status, but — same as
-- every other cancellation path — can never set decided_outcome; that
-- stays Office-only via decideCancellation (Phase 4). requested_via must
-- be 'online' and decided_outcome must be null, so a passenger can never
-- insert a row that looks pre-decided.
create policy cancellations_passenger_insert on cancellations for insert
  with check (
    requested_via = 'online'
    and decided_outcome is null
    and exists (
      select 1 from bookings b
      join passenger_account_users pau on pau.passenger_id = b.lead_passenger_id
      where b.id = cancellations.booking_id and pau.user_id = auth.uid()
    )
  );

create policy cancellations_passenger_select on cancellations for select
  using (
    exists (
      select 1 from bookings b
      join passenger_account_users pau on pau.passenger_id = b.lead_passenger_id
      where b.id = cancellations.booking_id and pau.user_id = auth.uid()
    )
  );
