-- vehicle_duties: chains a vehicle's day across departures (build spec
-- §22) - a van running London→Antwerp in the morning and Antwerp→London in
-- the evening is one duty across two departures, so mileage/hours carry
-- across both legs instead of being double-counted.
create table if not exists vehicle_duties (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  duty_date date not null,
  start_odometer int,
  end_odometer int,
  notes text,
  created_at timestamptz not null default now()
);

alter table departures add column if not exists vehicle_duty_id uuid references vehicle_duties(id);

alter table vehicle_duties enable row level security;
create policy vehicle_duties_dispatcher_manage on vehicle_duties for all
  using (is_dispatcher())
  with check (is_dispatcher());
grant select, insert, update, delete on public.vehicle_duties to authenticated;
grant select, insert, update, delete on public.vehicle_duties to service_role;

-- driver_assignments: build spec §22. "Driver X drove Vehicle Y from Stop
-- A through Stop B." from_stop_sequence/to_stop_sequence null = covers the
-- whole departure (the common single-driver case). Supports two-driver
-- operation, mid-route changeovers, and different drivers on outbound vs
-- return legs (each leg is its own departure row).
--
-- This is the FIRST table in the whole schema with a driver-visible RLS
-- policy - Phase 1 deliberately had none (see 0010/0015's comments). It's
-- safe here because driver_assignments carries no fares, deposits or
-- vulnerability data - just "who's driving what, when." Everything a
-- driver actually needs to see about passengers/stops goes through the
-- security-definer functions in 0027, not raw table access, so this
-- migration does NOT grant drivers any new access to departures,
-- operational_stops, booking_passengers or passengers.
create table if not exists driver_assignments (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references departures(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid not null references profiles(id),
  role text not null default 'driver' check (role in ('driver', 'co_driver')),
  from_stop_sequence int,
  to_stop_sequence int,
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned', 'accepted', 'declined', 'completed')),
  created_at timestamptz not null default now()
);

create index if not exists driver_assignments_departure_idx on driver_assignments (departure_id);
create index if not exists driver_assignments_driver_idx on driver_assignments (driver_id);

alter table driver_assignments enable row level security;

create policy driver_assignments_dispatcher_manage on driver_assignments for all
  using (is_dispatcher())
  with check (is_dispatcher());

create policy driver_assignments_driver_select_own on driver_assignments for select
  using (is_driver() and driver_id = auth.uid());

grant select, insert, update, delete on public.driver_assignments to authenticated;
grant select, insert, update, delete on public.driver_assignments to service_role;

-- Security-definer helper: does the calling driver's current assignment
-- cover this departure/stop-sequence combination? Used by both the
-- driver-facing functions in 0027 and (optionally) future RLS policies.
-- 'accepted' status is treated the same as 'assigned' here deliberately -
-- a driver shouldn't lose visibility into their own work just because
-- they haven't tapped "accept" yet, only 'declined'/'completed' exclude.
create or replace function driver_covers_stop(p_departure_id uuid, p_sequence int)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from driver_assignments da
    where da.departure_id = p_departure_id
      and da.driver_id = auth.uid()
      and da.status in ('assigned', 'accepted')
      and (da.from_stop_sequence is null or p_sequence >= da.from_stop_sequence)
      and (da.to_stop_sequence is null or p_sequence <= da.to_stop_sequence)
  );
$$;
