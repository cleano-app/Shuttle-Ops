-- Build spec Phase 5 (§39): referrer portal and sponsorship. organizations
-- (0005) already exists with org_type in ('referrer', 'sponsor').
-- organization_account_users mirrors passenger_account_users (0011)
-- exactly — same join-table shape, same reasoning (an org may eventually
-- have more than one logged-in contact).
--
-- Unlike passenger signup, there is deliberately NO public self-signup
-- RPC here: an org must already exist (Office creates it — the
-- organizations_office_manage policy from 0005 already allows this) before
-- anyone can be linked to it. A referrer/sponsor is a known, vetted body
-- (a community organisation, a synagogue, a charity partner), not an
-- anonymous public signup — Office links a specific user to a specific org
-- via the existing office-manage policy below, the same way it already
-- manages passenger_account_users.
create table if not exists organization_account_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table organization_account_users enable row level security;

create policy organization_account_users_self on organization_account_users for select
  using (user_id = auth.uid());

create policy organization_account_users_office_manage on organization_account_users for all
  using (is_office())
  with check (is_office());

grant select on public.organization_account_users to authenticated;
grant insert, update, delete on public.organization_account_users to authenticated;
grant select, insert, update, delete on public.organization_account_users to service_role;

create or replace function get_my_organization() returns table(
  id uuid,
  name text,
  org_type text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.org_type
  from organizations o
  join organization_account_users oau on oau.organization_id = o.id
  where oau.user_id = auth.uid();
$$;

grant execute on function get_my_organization() to authenticated;

-- refer_passenger: a referrer org's entry point for putting a new
-- passenger forward. Always creates a brand new passengers row (same
-- "never claim an existing record by name match" reasoning as
-- signup_passenger_account in 0050) with referrer_org_id forced to the
-- caller's own org — a referrer can never backdate or reassign an
-- existing passenger's referral by calling this again.
create or replace function refer_passenger(
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_category text default 'man',
  p_preferred_language text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_org_type text;
  v_passenger_id uuid;
begin
  select oau.organization_id, o.org_type into v_org_id, v_org_type
  from organization_account_users oau
  join organizations o on o.id = oau.organization_id
  where oau.user_id = auth.uid();

  if v_org_id is null then
    raise using message = 'not_linked';
  end if;
  if v_org_type <> 'referrer' then
    raise using message = 'not_a_referrer';
  end if;

  insert into passengers (full_name, phone, email, preferred_language, category, referrer_org_id, created_via)
  values (p_full_name, p_phone, p_email, p_preferred_language, p_category, v_org_id, 'referrer')
  returning id into v_passenger_id;

  return v_passenger_id;
end;
$$;

grant execute on function refer_passenger(text, text, text, text, text) to authenticated;

-- list_my_referred_passengers: curated, same vulnerability_notes/
-- is_vulnerable exclusion as get_my_passenger_profile (0050) — a referrer
-- put someone forward, it doesn't get Office's internal notes about them.
create or replace function list_my_referred_passengers() returns table(
  passenger_id uuid,
  full_name text,
  phone text,
  category text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.phone, p.category, p.created_at
  from passengers p
  join organization_account_users oau on oau.organization_id = p.referrer_org_id
  where oau.user_id = auth.uid()
  order by p.created_at desc;
$$;

grant execute on function list_my_referred_passengers() to authenticated;

-- list_my_sponsored_bookings: a sponsor sees that a sponsored seat was
-- used and what it cost to sponsor — not who travelled. Passenger
-- identity is deliberately withheld from a sponsor (category + trip date
-- only), same privacy-by-default posture as everything else on this
-- table's neighbours.
create or replace function list_my_sponsored_bookings() returns table(
  booking_passenger_id uuid,
  category text,
  route_name text,
  direction text,
  depart_at timestamptz,
  sponsored numeric,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  select bp.id, bp.category, r.name, d.direction, d.depart_at, bp.sponsored, bp.currency
  from booking_passengers bp
  join bookings b on b.id = bp.booking_id
  join departures d on d.id = b.departure_id
  join routes r on r.id = d.route_id
  join organization_account_users oau on oau.organization_id = bp.sponsor_org_id
  where oau.user_id = auth.uid()
  order by d.depart_at desc;
$$;

grant execute on function list_my_sponsored_bookings() to authenticated;
