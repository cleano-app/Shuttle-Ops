-- Live driver locations for the Office dashboard map (owner, 1 Oct 2026:
-- "a Google map with drivers' location"). This is a change from spec
-- §2/§10 (no external mapping) made by the owner; routing/ETA still use the
-- shuttle's own timings, the map only shows where vans are.
--
-- The driver's phone sends its position while the route screen is open
-- (a web page can't track with the phone locked). Rows are only ever the
-- driver's own (insert-only for them, like driver_duty_events); Office,
-- admin and dispatch read the latest per driver through a curated
-- function. Positions older than 3 days are swept by that function, so the
-- table never becomes a movement history of individuals.

create table if not exists driver_locations (
  id bigint generated always as identity primary key,
  driver_id uuid not null references profiles(id) on delete cascade,
  departure_id uuid references departures(id) on delete set null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m real,
  heading real,
  speed_mps real,
  recorded_at timestamptz not null default now()
);

create index if not exists driver_locations_driver_time_idx
  on driver_locations (driver_id, recorded_at desc);

alter table driver_locations enable row level security;

create policy driver_locations_driver_insert on driver_locations for insert
  with check (is_driver() and driver_id = auth.uid());

grant insert on public.driver_locations to authenticated;
grant select, insert, update, delete on public.driver_locations to service_role;

-- Latest fix per driver within the last `p_hours` hours, with who they are
-- and what they're driving. Office/admin/dispatcher only.
create or replace function get_live_driver_locations(p_hours int default 12)
returns table (
  driver_id uuid,
  driver_name text,
  phone text,
  departure_id uuid,
  vehicle_registration text,
  lat double precision,
  lng double precision,
  accuracy_m real,
  heading real,
  speed_mps real,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (is_office() or is_dispatcher()) then
    raise using message = 'not_authorized';
  end if;

  delete from driver_locations where recorded_at < now() - interval '3 days';

  return query
  select distinct on (l.driver_id)
    l.driver_id,
    p.display_name,
    p.phone,
    l.departure_id,
    v.registration,
    l.lat,
    l.lng,
    l.accuracy_m,
    l.heading,
    l.speed_mps,
    l.recorded_at
  from driver_locations l
  join profiles p on p.id = l.driver_id
  left join driver_assignments da
    on da.driver_id = l.driver_id and da.departure_id = l.departure_id
  left join vehicles v on v.id = da.vehicle_id
  where l.recorded_at > now() - make_interval(hours => p_hours)
  order by l.driver_id, l.recorded_at desc;
end;
$$;

revoke all on function get_live_driver_locations(int) from public, anon;
grant execute on function get_live_driver_locations(int) to authenticated;
