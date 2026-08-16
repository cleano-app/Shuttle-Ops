-- profiles: one row per auth.users row, created out-of-band (Supabase
-- dashboard or scripts/seed-users.ts) — no self-registration yet. Four
-- staff roles per build spec §4 (Admin/Office/Dispatcher/Driver); Passenger
-- and Referrer are separate account types handled by
-- passenger_account_users (0011), not this table — Phase 1 builds no
-- self-service login for either.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'office', 'dispatcher', 'driver')),
  display_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- security definer avoids RLS recursion when policies on profiles itself
-- (and on every other role-gated table) need to check the caller's role.
-- Each helper is a superset of the more junior ones below it, mirroring the
-- spec's role scope table (§4): Office can do everything Dispatcher can,
-- Admin can do everything Office can.
create or replace function is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_office()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'office')
  );
$$;

create or replace function is_dispatcher()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'office', 'dispatcher')
  );
$$;

create or replace function is_driver()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'driver'
  );
$$;

alter table profiles enable row level security;

create policy profiles_select on profiles for select
  using (id = auth.uid() or is_admin());

create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on profiles for all
  using (is_admin())
  with check (is_admin());

-- RLS restricts *rows*; the role still needs a base table GRANT to attempt
-- the query at all (same convention as Cleano Ops: no auto-grant for tables
-- created outside the Supabase SQL editor).
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
